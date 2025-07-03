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
  RateConvertDestinationOpts,
  RateConvertSourceOpts,
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
import { ConvertResults } from '../../rates/util'

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
  const { receiver, debitAmount, receiveAmount, walletAddress } = options

  let debitAmountValue: bigint
  let receiveAmountValue: bigint
  let exchangeRate: number

  const convert = async (
    opts: RateConvertSourceOpts | RateConvertDestinationOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError> => {
    let convertResults: ConvertResults | ConvertError
    try {
      convertResults =
        'sourceAmount' in opts
          ? await deps.ratesService.convertSource(opts, tenantId)
          : await deps.ratesService.convertDestination(opts, tenantId)
    } catch (err) {
      deps.logger.error(
        { opts, err },
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
    return convertResults
  }

  if (debitAmount) {
    debitAmountValue = debitAmount.value
    const convertResults = await convert(
      {
        sourceAmount: debitAmountValue,
        sourceAsset: {
          code: walletAddress.asset.code,
          scale: walletAddress.asset.scale
        },
        destinationAsset: {
          code: receiver.assetCode,
          scale: receiver.assetScale
        }
      },
      options.walletAddress.tenantId
    )
    if (isConvertError(convertResults)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description: 'Failed to convert debitAmount to receive amount',
          retryable: false
        }
      )
    }
    receiveAmountValue = convertResults.amount
    exchangeRate = convertResults.scaledExchangeRate
  } else if (receiveAmount) {
    receiveAmountValue = receiveAmount.value
    const convertResults = await convert(
      {
        destinationAmount: receiveAmountValue,
        sourceAsset: {
          code: walletAddress.asset.code,
          scale: walletAddress.asset.scale
        },
        destinationAsset: {
          code: receiveAmount.assetCode,
          scale: receiveAmount.assetScale
        }
      },
      options.walletAddress.tenantId
    )
    if (isConvertError(convertResults)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description: 'Failed to convert receiveAmount to debitAmount',
          retryable: false
        }
      )
    }
    debitAmountValue = convertResults.amount
    exchangeRate = convertResults.scaledExchangeRate
  } else if (receiver.incomingAmount) {
    receiveAmountValue = receiver.incomingAmount.value
    const convertResults = await convert(
      {
        destinationAmount: receiveAmountValue,
        sourceAsset: {
          code: walletAddress.asset.code,
          scale: walletAddress.asset.scale
        },
        destinationAsset: {
          code: receiver.incomingAmount.assetCode,
          scale: receiver.incomingAmount.assetScale
        }
      },
      options.walletAddress.tenantId
    )
    if (isConvertError(convertResults)) {
      throw new PaymentMethodHandlerError(
        'Received error during local quoting',
        {
          description:
            'Failed to convert receiver.incomingAmount to debitAmount',
          retryable: false
        }
      )
    }
    debitAmountValue = convertResults.amount
    exchangeRate = convertResults.scaledExchangeRate
  } else {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'No value provided to get quote from',
      retryable: false
    })
  }

  if (debitAmountValue <= BigInt(0)) {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'debit amount of local quote is non-positive',
      retryable: false,
      code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount,
      details: {
        minSendAmount: BigInt(Math.ceil(1 / exchangeRate))
      }
    })
  }

  if (receiveAmountValue <= BigInt(0)) {
    throw new PaymentMethodHandlerError('Received error during local quoting', {
      description: 'receive amount of local quote is non-positive',
      retryable: false,
      code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount,
      details: {
        minSendAmount: BigInt(Math.ceil(1 / exchangeRate))
      }
    })
  }

  return {
    receiver: options.receiver,
    walletAddress: options.walletAddress,
    estimatedExchangeRate: exchangeRate,
    debitAmount: {
      value: debitAmountValue,
      assetCode: options.walletAddress.asset.code,
      assetScale: options.walletAddress.asset.scale
    },
    receiveAmount: {
      value: receiveAmountValue,
      assetCode: options.receiver.assetCode,
      assetScale: options.receiver.assetScale
    }
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
  if (incomingPayment.isExpiredOrComplete()) {
    throw new PaymentMethodHandlerError('Bad Incoming Payment State', {
      description: `Incoming Payment cannot be expired or completed`,
      retryable: false
    })
  }

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
          description: 'Unknown error while trying to create liquidity account',
          retryable: false
        }
      )
    }
  }

  const transferOptions: TransferOptions = {
    sourceAccount: outgoingPayment,
    destinationAccount: incomingPayment,
    sourceAmount: finalDebitAmount,
    destinationAmount: finalReceiveAmount,
    transferType: TransferType.TRANSFER,
    // TODO: remove timeout after implementing single phase transfer
    // https://github.com/interledger/rafiki/issues/2629
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
  const transferError = await trxOrError.post()

  if (isTransferError(transferError)) {
    throw new PaymentMethodHandlerError('Received error during local payment', {
      description: errorToMessage[transferError],
      retryable: false
    })
  }
}
