import assert from 'assert'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import * as Pay from '@interledger/pay'

import { randomAsset } from './asset'
import { createIncomingPayment } from './incomingPayment'
import { AppServices } from '../app'
import { AssetOptions } from '../asset/service'
import { Quote } from '../open_payments/quote/model'
import { CreateQuoteOptions } from '../open_payments/quote/service'

export type CreateTestQuoteOptions = CreateQuoteOptions & {
  validDestination?: boolean
}

export async function createQuote(
  deps: IocContract<AppServices>,
  {
    accountId,
    receivingAccount,
    receivingPayment,
    sendAmount,
    receiveAmount,
    validDestination = true
  }: CreateTestQuoteOptions
): Promise<Quote> {
  assert.ok(!receivingAccount !== !receivingPayment)
  const accountService = await deps.use('accountService')
  const account = await accountService.get(accountId)
  assert.ok(account)
  assert.ok(
    !sendAmount ||
      (account.asset.code === sendAmount.assetCode &&
        account.asset.scale === sendAmount.assetScale)
  )
  let completeReceivingPayment = false

  const config = await deps.use('config')
  let receiveAsset: AssetOptions | undefined
  if (validDestination) {
    if (receivingAccount) {
      assert.ok(!sendAmount !== !receiveAmount)
      const accountUrlPrefix = `${config.publicHost}/`
      assert.ok(receivingAccount.startsWith(accountUrlPrefix))
      const receivingAccountId = receivingAccount.slice(accountUrlPrefix.length)
      const account = await accountService.get(receivingAccountId)
      assert.ok(account)
      if (receiveAmount) {
        assert.ok(
          account.asset.code === receiveAmount.assetCode &&
            account.asset.scale === receiveAmount.assetScale
        )
      } else {
        assert.ok(sendAmount)
        receiveAsset = {
          code: account.asset.code,
          scale: account.asset.scale
        }
        completeReceivingPayment = true
      }

      const incomingPayment = await createIncomingPayment(deps, {
        accountId: receivingAccountId,
        incomingAmount: receiveAmount
      })
      receivingPayment = `${receivingAccount}/incoming-payments/${incomingPayment.id}`
    } else {
      assert.ok(receivingPayment)
      assert.ok(receivingPayment.startsWith(config.publicHost))
      const path = receivingPayment
        .slice(config.publicHost.length + 1)
        .split('/')
      assert.ok(path.length === 3)
      const incomingPaymentService = await deps.use('incomingPaymentService')
      const incomingPayment = await incomingPaymentService.get(path[2])
      assert.ok(incomingPayment)
      assert.ok(incomingPayment.incomingAmount || receiveAmount || sendAmount)
      if (receiveAmount) {
        assert.ok(
          incomingPayment.asset.code === receiveAmount.assetCode &&
            incomingPayment.asset.scale === receiveAmount.assetScale
        )
        assert.ok(
          !incomingPayment.incomingAmount ||
            receiveAmount.value <= incomingPayment.incomingAmount.value
        )
      } else {
        receiveAsset = {
          code: incomingPayment.asset.code,
          scale: incomingPayment.asset.scale
        }
        if (!sendAmount) {
          receiveAmount = incomingPayment.incomingAmount
        }
      }
    }
  } else {
    receivingPayment =
      receivingPayment || `${receivingAccount}/incoming-payments/${uuid()}`
    receiveAsset = randomAsset()
    if (!sendAmount && !receiveAmount) {
      receiveAmount = {
        value: BigInt(56),
        assetCode: receiveAsset.code,
        assetScale: receiveAsset.scale
      }
    }
  }

  if (sendAmount) {
    assert.ok(receiveAsset)
    receiveAmount = {
      value: BigInt(
        Math.ceil(Number(sendAmount.value) / (2 * (1 + config.slippage)))
      ),
      assetCode: receiveAsset.code,
      assetScale: receiveAsset.scale
    }
  } else {
    assert.ok(receiveAmount)
    sendAmount = {
      value: BigInt(
        Math.ceil(Number(receiveAmount.value) * 2 * (1 + config.slippage))
      ),
      assetCode: account.asset.code,
      assetScale: account.asset.scale
    }
  }

  return await Quote.query()
    .insertAndFetch({
      accountId,
      assetId: account.assetId,
      receivingPayment,
      sendAmount,
      receiveAmount,
      maxPacketAmount: BigInt('9223372036854775807'),
      lowEstimatedExchangeRate: Pay.Ratio.of(
        Pay.Int.from(500000000000n) as Pay.PositiveInt,
        Pay.Int.from(1000000000000n) as Pay.PositiveInt
      ),
      highEstimatedExchangeRate: Pay.Ratio.of(
        Pay.Int.from(500000000001n) as Pay.PositiveInt,
        Pay.Int.from(1000000000000n) as Pay.PositiveInt
      ),
      minExchangeRate: Pay.Ratio.of(
        Pay.Int.from(495n) as Pay.PositiveInt,
        Pay.Int.from(1000n) as Pay.PositiveInt
      ),
      completeReceivingPayment,
      expiresAt: new Date(Date.now() + config.quoteLifespan)
    })
    .withGraphFetched('asset')
}
