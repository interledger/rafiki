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
import assert from 'assert'
import { Config } from '../config/app'
import { OpenPaymentsPaymentMethod } from '../payment-method/provider/service'

export type CreateTestQuoteAndOutgoingPaymentOptions = Omit<
  CreateOutgoingPaymentOptions & CreateTestQuoteOptions,
  'quoteId'
>

export async function createOutgoingPayment(
  deps: IocContract<AppServices>,
  options: CreateTestQuoteAndOutgoingPaymentOptions
): Promise<OutgoingPayment> {
  const quoteOptions: CreateTestQuoteOptions = {
    tenantId: options.tenantId,
    walletAddressId: options.walletAddressId,
    client: options.client,
    receiver: options.receiver,
    validDestination: options.validDestination,
    exchangeRate: options.exchangeRate,
    method: options.method
  }
  if (options.debitAmount) quoteOptions.debitAmount = options.debitAmount
  if (options.receiveAmount) quoteOptions.receiveAmount = options.receiveAmount
  const quote = await createQuote(deps, quoteOptions)
  const outgoingPaymentService = await deps.use('outgoingPaymentService')
  const config = await deps.use('config')
  const receiverService = await deps.use('receiverService')
  const paymentMethodProviderService = await deps.use(
    'paymentMethodProviderService'
  )
  if (options.validDestination === false) {
    const walletAddressService = await deps.use('walletAddressService')
    const walletAddress = await walletAddressService.get(
      options.walletAddressId
    )
    assert(walletAddress)

    const incomingPayment = await createIncomingPayment(deps, {
      walletAddressId: options.walletAddressId,
      tenantId: walletAddress.tenantId
    })
    await incomingPayment.$query().delete()

    jest
      .spyOn(receiverService, 'get')
      .mockResolvedValueOnce(
        new Receiver(
          incomingPayment.toOpenPaymentsTypeWithMethods(
            config.openPaymentsUrl,
            walletAddress,
            await paymentMethodProviderService.getPaymentMethods(
              incomingPayment
            )
          ),
          false
        )
      )
  }
  const outgoingPaymentOrError = await outgoingPaymentService.create({
    ...options,
    quoteId: quote.id
  })
  if (isOutgoingPaymentError(outgoingPaymentOrError)) {
    throw new Error(outgoingPaymentOrError)
  }

  const accountingService = await deps.use('accountingService')
  await accountingService.createLiquidityAccount(
    outgoingPaymentOrError,
    LiquidityAccountType.OUTGOING
  )

  return outgoingPaymentOrError
}

interface CreateOutgoingPaymentWithReceiverArgs {
  receivingWalletAddress: WalletAddress
  method: 'ilp'
  incomingPaymentOptions?: Partial<CreateIncomingPaymentOptions>
  quoteOptions?: Partial<
    Pick<
      CreateTestQuoteAndOutgoingPaymentOptions,
      'debitAmount' | 'receiveAmount' | 'exchangeRate' | 'tenantId'
    >
  >
  sendingWalletAddress: WalletAddress
  fundOutgoingPayment?: boolean
  receiverPaymentMethods?: OpenPaymentsPaymentMethod[]
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
    walletAddressId: args.receivingWalletAddress.id,
    tenantId: Config.operatorTenantId
  })

  const config = await deps.use('config')
  const paymentMethodProviderService = await deps.use(
    'paymentMethodProviderService'
  )

  const receiver = new Receiver(
    incomingPayment.toOpenPaymentsTypeWithMethods(
      config.openPaymentsUrl,
      args.receivingWalletAddress,
      args.receiverPaymentMethods ||
        (await paymentMethodProviderService.getPaymentMethods(incomingPayment))
    ),
    false
  )

  const outgoingPayment = await createOutgoingPayment(deps, {
    tenantId: args.sendingWalletAddress.tenantId,
    walletAddressId: args.sendingWalletAddress.id,
    method: args.method,
    receiver: receiver.incomingPayment!.id!,
    ...args.quoteOptions
  })

  if (fundOutgoingPayment) {
    const outgoingPaymentService = await deps.use('outgoingPaymentService')
    await outgoingPaymentService.fund({
      id: outgoingPayment.id,
      tenantId: args.sendingWalletAddress.tenantId,
      amount: outgoingPayment.debitAmount.value,
      transferId: uuid()
    })
  }

  return { incomingPayment, receiver, outgoingPayment }
}
