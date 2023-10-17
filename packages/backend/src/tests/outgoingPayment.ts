import base64url from 'base64url'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'

import { createQuote, CreateTestQuoteOptions } from './quote'
import { AppServices } from '../app'
import { Receiver } from '../open_payments/receiver/model'
import { isOutgoingPaymentError } from '../open_payments/payment/outgoing/errors'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { CreateOutgoingPaymentOptions } from '../open_payments/payment/outgoing/service'
import { LiquidityAccountType } from '../accounting/service'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { CreateIncomingPaymentOptions } from '../open_payments/payment/incoming/service'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { createIncomingPayment } from './incomingPayment'

type CreateTestQuoteAndOutgoingPaymentOptions = Omit<
  CreateOutgoingPaymentOptions & CreateTestQuoteOptions,
  'quoteId'
>

export async function createOutgoingPayment(
  deps: IocContract<AppServices>,
  options: CreateTestQuoteAndOutgoingPaymentOptions
): Promise<OutgoingPayment> {
  const quoteOptions: CreateTestQuoteOptions = {
    walletAddressId: options.walletAddressId,
    client: options.client,
    receiver: options.receiver,
    validDestination: options.validDestination,
    exchangeRate: options.exchangeRate
  }
  if (options.debitAmount) quoteOptions.debitAmount = options.debitAmount
  if (options.receiveAmount) quoteOptions.receiveAmount = options.receiveAmount
  const quote = await createQuote(deps, quoteOptions)
  const outgoingPaymentService = await deps.use('outgoingPaymentService')
  const receiverService = await deps.use('receiverService')
  if (options.validDestination === false) {
    const streamServer = await deps.use('streamServer')
    const { ilpAddress, sharedSecret } = streamServer.generateCredentials()
    jest.spyOn(receiverService, 'get').mockResolvedValueOnce(
      Receiver.fromConnection({
        id: options.receiver,
        ilpAddress,
        sharedSecret: base64url(sharedSecret),
        assetCode: quote.receiveAmount.assetCode,
        assetScale: quote.receiveAmount.assetScale
      })
    )
  }
  const outgoingPaymentOrError = await outgoingPaymentService.create({
    ...options,
    quoteId: quote.id
  })
  if (isOutgoingPaymentError(outgoingPaymentOrError)) {
    throw new Error()
  }

  const accountingService = await deps.use('accountingService')
  await accountingService.createLiquidityAccount(
    outgoingPaymentOrError,
    LiquidityAccountType.OUTGOING
  )

  return outgoingPaymentOrError
}

interface CreateOutgoingPaymentWithReceiverArgs {
  receivingWalletAddres: WalletAddress
  incomingPaymentOptions?: Partial<CreateIncomingPaymentOptions>
  quoteOptions?: Partial<
    Pick<
      CreateTestQuoteAndOutgoingPaymentOptions,
      'debitAmount' | 'receiveAmount' | 'exchangeRate'
    >
  >
  sendingWalletAddress: WalletAddress
  fundOutgoingPayment?: boolean
}

interface CreateOutgoingPaymentWithReceiverResponse {
  incomingPayment: IncomingPayment
  outgoingPayment: OutgoingPayment
  receiver: Receiver
}

export async function createOutgoingPaymentWithReceiver(
  deps: IocContract<AppServices>,
  args: CreateOutgoingPaymentWithReceiverArgs
): Promise<CreateOutgoingPaymentWithReceiverResponse> {
  const noAmountSet =
    !args.quoteOptions?.debitAmount &&
    !args.quoteOptions?.receiveAmount &&
    !args.incomingPaymentOptions?.incomingAmount

  if (noAmountSet) {
    throw new Error('No receive or debit amount set')
  }

  const { fundOutgoingPayment = true } = args

  const incomingPayment = await createIncomingPayment(deps, {
    ...args.incomingPaymentOptions,
    walletAddressId: args.receivingWalletAddres.id
  })

  const connectionService = await deps.use('connectionService')
  const receiver = Receiver.fromIncomingPayment(
    incomingPayment.toOpenPaymentsType(
      args.receivingWalletAddres,
      connectionService.get(incomingPayment)!
    )
  )

  const outgoingPayment = await createOutgoingPayment(deps, {
    walletAddressId: args.sendingWalletAddress.id,
    receiver: receiver.incomingPayment!.id!,
    ...args.quoteOptions
  })

  if (fundOutgoingPayment) {
    const outgoingPaymentService = await deps.use('outgoingPaymentService')
    await outgoingPaymentService.fund({
      id: outgoingPayment.id,
      amount: outgoingPayment.debitAmount.value,
      transferId: uuid()
    })
  }

  return { incomingPayment, receiver, outgoingPayment }
}
