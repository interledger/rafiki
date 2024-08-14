import { BaseService } from '../../shared/baseService'
import {
  PaymentQuote,
  PaymentMethodService,
  StartQuoteOptions,
  PayOptions
} from '../handler/service'
import { isConvertError, RatesService } from '../../rates/service'
import { IAppConfig } from '../../config/app'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../handler/errors'
import { TelemetryService } from '../../telemetry/service'
import { Asset } from '../../rates/util'

export interface LocalPaymentService extends PaymentMethodService {}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  ratesService: RatesService
  telemetry?: TelemetryService
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

  if (debitAmount) {
    debitAmountValue = debitAmount.value
    const converted = await deps.ratesService.convert({
      sourceAmount: debitAmountValue,
      sourceAsset: {
        code: debitAmount.assetCode,
        scale: debitAmount.assetScale
      },
      destinationAsset: { code: receiver.assetCode, scale: receiver.assetScale }
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
    const converted = await deps.ratesService.convert({
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
    const converted = await deps.ratesService.convert({
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

  return {
    receiver: options.receiver,
    walletAddress: options.walletAddress,
    // TODO: is this correct for both fixed send/receive? or needs to be flipped?
    estimatedExchangeRate: Number(debitAmountValue / receiveAmountValue),
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
  throw new Error('local pay not implemented')
}
