import { IocContract } from '@adonisjs/fold'
import * as Pay from '@interledger/pay'

import { randomAsset } from './asset'
import { AppServices } from '../app'
import { AssetOptions } from '../asset/service'
import { Quote } from '../open_payments/quote/model'
import { CreateQuoteOptions } from '../open_payments/quote/service'
import { PaymentQuote } from '../payment-method/handler/service'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import { Receiver } from '../open_payments/receiver/model'

export type CreateTestQuoteOptions = CreateQuoteOptions & {
  validDestination?: boolean
  withFee?: boolean
}

type MockQuoteArgs = {
  receiver: Receiver
  paymentPointer: PaymentPointer
  exchangeRate?: number
} & ({ debitAmountValue: bigint } | { receiveAmountValue: bigint })

export function mockQuote(
  args: MockQuoteArgs,
  overrides?: Partial<PaymentQuote>
): PaymentQuote {
  const { paymentPointer, receiver, exchangeRate = 1 } = args

  return {
    receiver,
    paymentPointer,
    debitAmount: {
      assetCode: paymentPointer.asset.code,
      assetScale: paymentPointer.asset.scale,
      value:
        'debitAmountValue' in args
          ? args.debitAmountValue
          : BigInt(Math.ceil(Number(args.receiveAmountValue) * exchangeRate))
    },
    receiveAmount: {
      assetCode: receiver.assetCode,
      assetScale: receiver.assetScale,
      value:
        'receiveAmountValue' in args
          ? args.receiveAmountValue
          : BigInt(Math.ceil(Number(args.debitAmountValue) * exchangeRate))
    },
    estimatedExchangeRate: exchangeRate,
    additionalFields: {
      maxPacketAmount: BigInt(Pay.Int.MAX_U64.toString()),
      lowEstimatedExchangeRate: Pay.Ratio.from(exchangeRate ?? 1),
      highEstimatedExchangeRate: Pay.Ratio.from(exchangeRate ?? 1),
      minExchangeRate: Pay.Ratio.from(exchangeRate ?? 1)
    },
    ...overrides
  }
}

export async function createQuote(
  deps: IocContract<AppServices>,
  {
    walletAddressId,
    receiver: receiverUrl,
    debitAmount,
    receiveAmount,
    client,
    validDestination = true,
    withFee = false
  }: CreateTestQuoteOptions
): Promise<Quote> {
  const walletAddressService = await deps.use('walletAddressService')
  const walletAddress = await walletAddressService.get(walletAddressId)
  if (!walletAddress) {
    throw new Error()
  }
  if (
    debitAmount &&
    (walletAddress.asset.code !== debitAmount.assetCode ||
      walletAddress.asset.scale !== debitAmount.assetScale)
  ) {
    throw new Error()
  }

  const config = await deps.use('config')
  let receiveAsset: AssetOptions | undefined
  if (validDestination) {
    const receiverService = await deps.use('receiverService')
    const receiver = await receiverService.get(receiverUrl)
    if (!receiver) {
      throw new Error()
    }
    if (!receiver.incomingAmount && !receiveAmount && !debitAmount) {
      throw new Error()
    }
    if (receiveAmount) {
      if (
        receiver.assetCode !== receiveAmount.assetCode ||
        receiver.assetScale !== receiveAmount.assetScale
      ) {
        throw new Error()
      }
      if (
        receiver.incomingAmount &&
        receiveAmount.value > receiver.incomingAmount.value
      ) {
        throw new Error()
      }
    } else {
      receiveAsset = receiver.asset
      if (!debitAmount) {
        receiveAmount = receiver.incomingAmount
      }
    }
  } else {
    receiveAsset = randomAsset()
    if (!debitAmount && !receiveAmount) {
      receiveAmount = {
        value: BigInt(56),
        assetCode: receiveAsset.code,
        assetScale: receiveAsset.scale
      }
    }
  }

  if (debitAmount) {
    if (!receiveAsset) {
      throw new Error()
    }
    receiveAmount = {
      value: BigInt(
        Math.ceil(Number(debitAmount.value) / (2 * (1 + config.slippage)))
      ),
      assetCode: receiveAsset.code,
      assetScale: receiveAsset.scale
    }
  } else {
    if (!receiveAmount) {
      throw new Error()
    }
    debitAmount = {
      value: BigInt(
        Math.ceil(Number(receiveAmount.value) * 2 * (1 + config.slippage))
      ),
      assetCode: walletAddress.asset.code,
      assetScale: walletAddress.asset.scale
    }
  }

  const withGraphFetchedArray = ['asset']
  if (withFee) {
    withGraphFetchedArray.push('fee')
  }
  const withGraphFetchedExpression = `[${withGraphFetchedArray.join(', ')}]`

  return await Quote.query()
    .insertAndFetch({
      walletAddressId,
      assetId: walletAddress.assetId,
      receiver: receiverUrl,
      debitAmount,
      receiveAmount,
      maxPacketAmount: BigInt('9223372036854775807'),
      estimatedExchangeRate: Pay.Ratio.of(
        Pay.Int.from(500000000000n) as Pay.PositiveInt,
        Pay.Int.from(1000000000000n) as Pay.PositiveInt
      ).valueOf(),
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
      expiresAt: new Date(Date.now() + config.quoteLifespan),
      client
    })
    .withGraphFetched(withGraphFetchedExpression)
}
