import { BaseService } from '../../shared/baseService'
import {
  PaymentQuote,
  PaymentMethodService,
  StartQuoteOptions,
  PayOptions
} from '../handler/service'
import {
  ConvertError,
  isConvertError,
  RateConvertOpts,
  RatesService
} from '../../rates/service'
import { IAppConfig } from '../../config/app'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../handler/errors'
import {
  AccountingService,
  LiquidityAccountType,
  TransferOptions,
  TransferType
} from '../../accounting/service'
import {
  AccountAlreadyExistsError,
  errorToMessage,
  isTransferError,
  TransferError
} from '../../accounting/errors'
import { IncomingPaymentService } from '../../open_payments/payment/incoming/service'
import { IncomingPaymentState } from '../../open_payments/payment/incoming/model'

export interface LocalPaymentService extends PaymentMethodService {}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  ratesService: RatesService
  accountingService: AccountingService
  incomingPaymentService: IncomingPaymentService
}

export async function createLocalPaymentService(
  deps_: ServiceDependencies
): Promise<LocalPaymentService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'LocalPaymentService' })
  }

  return {
    getQuote: (quoteOptions) => getQuote(deps, quoteOptions),
    pay: (payOptions) => pay(deps, payOptions)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  options: StartQuoteOptions
): Promise<PaymentQuote> {
  const { receiver, debitAmount, receiveAmount } = options

  let debitAmountValue: bigint
  let receiveAmountValue: bigint

  const convert = async (opts: RateConvertOpts) => {
    let converted: bigint | ConvertError
    try {
      converted = await deps.ratesService.convert(opts)
    } catch (err) {
      deps.logger.error(
        { receiver, debitAmount, receiveAmount, err },
        'Unknown error while attempting to convert rates'
      )
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description: 'Unknown error while attempting to convert rates',
          retryable: false
        }
      )
    }
    return converted
  }

  if (debitAmount) {
    debitAmountValue = debitAmount.value
    const converted = await convert({
      sourceAmount: debitAmountValue,
      sourceAsset: {
        code: debitAmount.assetCode,
        scale: debitAmount.assetScale
      },
      destinationAsset: {
        code: receiver.assetCode,
        scale: receiver.assetScale
      }
    })
    if (isConvertError(converted)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description: 'Failed to convert debitAmount to receive amount',
          retryable: false
        }
      )
    }
    receiveAmountValue = converted
  } else if (receiveAmount) {
    receiveAmountValue = receiveAmount.value
    const converted = await convert({
      sourceAmount: receiveAmountValue,
      sourceAsset: {
        code: receiveAmount.assetCode,
        scale: receiveAmount.assetScale
      },
      destinationAsset: {
        code: options.walletAddress.asset.code,
        scale: options.walletAddress.asset.scale
      }
    })
    if (isConvertError(converted)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description: 'Failed to convert receiveAmount to debitAmount',
          retryable: false
        }
      )
    }
    debitAmountValue = converted
  } else if (receiver.incomingAmount) {
    receiveAmountValue = receiver.incomingAmount.value
    const converted = await convert({
      sourceAmount: receiveAmountValue,
      sourceAsset: {
        code: receiver.incomingAmount.assetCode,
        scale: receiver.incomingAmount.assetScale
      },
      destinationAsset: {
        code: options.walletAddress.asset.code,
        scale: options.walletAddress.asset.scale
      }
    })
    if (isConvertError(converted)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description:
            'Failed to convert receiver.incomingAmount to debitAmount',
          retryable: false
        }
      )
    }
    debitAmountValue = converted
  } else {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'No value provided to get quote from',
      retryable: false
    })
  }

  if (debitAmountValue <= BigInt(0)) {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'debit amount of local quote is non-positive',
      retryable: false
    })
  }

  if (receiveAmountValue <= BigInt(0)) {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'receive amount of local quote is non-positive',
      retryable: false,
      code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
    })
  }

  return {
    receiver: options.receiver,
    walletAddress: options.walletAddress,
    estimatedExchangeRate:
      Number(receiveAmountValue) / Number(debitAmountValue),
    debitAmount: {
      value: debitAmountValue,
      assetCode: options.walletAddress.asset.code,
      assetScale: options.walletAddress.asset.scale
    },
    receiveAmount: {
      value: receiveAmountValue,
      assetCode: options.receiver.assetCode,
      assetScale: options.receiver.assetScale
    },
    additionalFields: {}
  }
}

async function pay(
  deps: ServiceDependencies,
  options: PayOptions
): Promise<void> {
  const { outgoingPayment, receiver, finalReceiveAmount, finalDebitAmount } =
    options

  const incomingPaymentId = receiver.incomingPayment.id.split('/').pop()
  if (!incomingPaymentId) {
    throw new PaymentMethodHandlerError('Received error during local payment', {
      description: 'Failed to parse incoming payment on receiver',
      retryable: false
    })
  }
  const incomingPayment = await deps.incomingPaymentService.get({
    id: incomingPaymentId
  })
  if (!incomingPayment) {
    throw new PaymentMethodHandlerError('Received error during local payment', {
      description: 'Incoming payment not found from receiver',
      retryable: false
    })
  }

  // TODO: remove incoming state check? perhaps only applies ilp account middleware where its checking many different things
  if (incomingPayment.state === IncomingPaymentState.Pending) {
    try {
      await deps.accountingService.createLiquidityAccount(
        incomingPayment,
        LiquidityAccountType.INCOMING
      )
    } catch (err) {
      if (!(err instanceof AccountAlreadyExistsError)) {
        deps.logger.error(
          { incomingPayment, err },
          'Failed to create liquidity account for local incoming payment'
        )
        throw new PaymentMethodHandlerError(
          'Received error during local payment',
          {
            description:
              'Unknown error while trying to create liquidity account',
            retryable: false
          }
        )
      }
    }
  }

  const transferOptions: TransferOptions = {
    sourceAccount: outgoingPayment,
    destinationAccount: incomingPayment,
    sourceAmount: finalDebitAmount,
    destinationAmount: finalReceiveAmount,
    transferType: TransferType.TRANSFER,
    // TODO: no timeout? theoretically possible (perhaps even correct?) but need to
    // update IncomingPayment state to COMPLETE some other way. trxOrError.post usually
    // will (via onCredit) but post will return error instead because its already posted.
    timeout: deps.config.tigerBeetleTwoPhaseTimeout
  }

  const trxOrError =
    await deps.accountingService.createTransfer(transferOptions)

  if (isTransferError(trxOrError)) {
    deps.logger.error(
      { transferOptions, transferError: trxOrError },
      'Could not create transfer'
    )
    switch (trxOrError) {
      case TransferError.InsufficientBalance:
      case TransferError.InsufficientLiquidity:
        throw new PaymentMethodHandlerError(
          'Received error during local payment',
          {
            description: errorToMessage[trxOrError],
            retryable: false
          }
        )
      default:
        throw new PaymentMethodHandlerError(
          'Received error during local payment',
          {
            description: 'Unknown error while trying to create transfer',
            retryable: false
          }
        )
    }
  }
  await trxOrError.post()
}
