import { BaseService } from '../../shared/baseService'
import { IAppConfig } from '../../config/app'
import { AxiosInstance, isAxiosError } from 'axios'
import {
  PaymentQuote,
  PaymentMethodService,
  StartQuoteOptions,
  PayOptions
} from '../handler/service'
import { FeeService } from '../../fee/service'
import { FeeType } from '../../fee/model'
import { PaymentMethodHandlerError } from '../handler/errors'
import { Transaction } from 'objection'
import {
  ConvertError,
  isConvertError,
  RateConvertSourceOpts,
  RateConvertDestinationOpts,
  RatesService
} from '../../rates/service'
import { ConvertResults } from '../../rates/util'

export interface SepaDetails {
  iban: string
  additionalProperties?: Record<string, unknown>
}

export interface SepaFees {
  [key: string]: unknown
}

export interface SepaPaymentService extends PaymentMethodService {
  getSepaDetails(
    walletAddress: string,
    paymentMethodType: string
  ): Promise<SepaDetails | undefined>
  getSepaFees(assetCode: string): Promise<SepaFees | undefined>
  refreshFees(): Promise<void>
}

interface ServiceDependencies extends BaseService {
  feeService: FeeService
  config: IAppConfig
  axios: AxiosInstance
  ratesService: RatesService
}

export async function createSepaPaymentService({
  logger,
  feeService,
  config,
  axios,
  ratesService
}: ServiceDependencies): Promise<SepaPaymentService> {
  const log = logger.child({
    service: 'SepaPaymentService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    feeService,
    config,
    axios,
    ratesService
  }

  return {
    getQuote: (quoteOptions, trx) => getQuote(deps, quoteOptions, trx),
    pay: (payOptions) => pay(deps, payOptions),
    getSepaDetails: (walletAddress, paymentMethodType) =>
      getSepaDetails(deps, walletAddress, paymentMethodType),
    getSepaFees: (assetCode) => getSepaFees(deps, assetCode),
    refreshFees: () => refreshFees(deps)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  quoteOptions: StartQuoteOptions,
  _trx?: Transaction
): Promise<PaymentQuote> {
  const { walletAddress, receiver, debitAmount, receiveAmount } = quoteOptions

  if (!debitAmount && !receiveAmount) {
    throw new PaymentMethodHandlerError(
      'Either debitAmount or receiveAmount must be provided',
      {
        description: 'Missing required amount for SEPA quote',
        retryable: false
      }
    )
  }

  // TODO Hardcode fee in admin API for now
  // Fixed fee of 1 euro for now
  // See if there is any percentage fee
  const fee = await deps.feeService.getLatestFee(
    walletAddress.asset.id,
    FeeType.Sending
  )

  if (!fee) {
    throw new PaymentMethodHandlerError(
      'No SEPA fees configured for this asset',
      {
        description: 'SEPA fees not found in database',
        retryable: false
      }
    )
  }

  let finalDebitAmount: bigint
  let finalReceiveAmount: bigint
  let exchangeRate: number

  const convert = async (
    opts: RateConvertSourceOpts | RateConvertDestinationOpts
  ): Promise<ConvertResults | ConvertError> => {
    let convertResults: ConvertResults | ConvertError
    try {
      convertResults =
        'sourceAmount' in opts
          ? await deps.ratesService.convertSource(opts)
          : await deps.ratesService.convertDestination(opts)
    } catch (err) {
      deps.logger.error(
        { opts, err },
        'Unknown error while attempting to convert rates'
      )
      throw new PaymentMethodHandlerError(
        'Received error during SEPA quoting',
        {
          description: 'Unknown error while attempting to convert rates',
          retryable: false
        }
      )
    }
    return convertResults
  }

  if (debitAmount) {
    finalDebitAmount = debitAmount.value
    const feeAmount = fee.calculate(debitAmount.value)
    finalReceiveAmount = debitAmount.value - feeAmount

    const convertResults = await convert({
      sourceAmount: finalDebitAmount,
      sourceAsset: {
        code: walletAddress.asset.code,
        scale: walletAddress.asset.scale
      },
      destinationAsset: {
        code: receiver.incomingAmount?.assetCode || walletAddress.asset.code,
        scale: receiver.incomingAmount?.assetScale || walletAddress.asset.scale
      }
    })
    if (isConvertError(convertResults)) {
      throw new PaymentMethodHandlerError(
        'Received error during SEPA quoting',
        {
          description: 'Failed to convert debitAmount to receive amount',
          retryable: false
        }
      )
    }
    exchangeRate = convertResults.scaledExchangeRate
  } else {
    finalReceiveAmount = receiveAmount!.value
    const feeAmount = fee.calculate(finalReceiveAmount)
    finalDebitAmount = finalReceiveAmount + feeAmount

    const convertResults = await convert({
      destinationAmount: finalReceiveAmount,
      sourceAsset: {
        code: walletAddress.asset.code,
        scale: walletAddress.asset.scale
      },
      destinationAsset: {
        code: receiveAmount!.assetCode,
        scale: receiveAmount!.assetScale
      }
    })
    if (isConvertError(convertResults)) {
      throw new PaymentMethodHandlerError(
        'Received error during SEPA quoting',
        {
          description: 'Failed to convert receiveAmount to debitAmount',
          retryable: false
        }
      )
    }
    exchangeRate = convertResults.scaledExchangeRate
  }

  return {
    walletAddress,
    receiver,
    debitAmount: {
      value: finalDebitAmount,
      assetCode: walletAddress.asset.code,
      assetScale: walletAddress.asset.scale
    },
    receiveAmount: {
      value: finalReceiveAmount,
      assetCode: receiver.incomingAmount?.assetCode || walletAddress.asset.code,
      assetScale:
        receiver.incomingAmount?.assetScale || walletAddress.asset.scale
    },
    estimatedExchangeRate: exchangeRate
  }
}

async function pay(
  deps: ServiceDependencies,
  payOptions: PayOptions
): Promise<void> {
  const { outgoingPayment, receiver, finalDebitAmount, finalReceiveAmount } =
    payOptions

  deps.logger.info(
    {
      outgoingPaymentId: outgoingPayment.id,
      receiverIncomingPaymentId: receiver.incomingPayment.id,
      debitAmount: finalDebitAmount.toString(),
      receiveAmount: finalReceiveAmount.toString()
    },
    'SEPA payment initiated - external transfer will be processed'
  )

  // TODO In a general implementation:
  // 1. Trigger SEPA payment
  // 2. Update the outgoing payment status based on the SEPA response

  // For now, we'll just log the payment and consider it successful since SEPA is an external payment method
}

async function getSepaDetails(
  deps: ServiceDependencies,
  walletAddress: string,
  paymentMethodType: string
): Promise<SepaDetails | undefined> {
  // if (!deps.config.sepaDetailsUrl) {
  //   deps.logger.warn('SEPA_DETAILS_URL not configured, skipping SEPA details fetch')
  //   return
  // }

  try {
    // const sepaDetails = await deps.axios.get(
    //   `${deps.config.sepaDetailsUrl}/details`,
    //   {
    //     params: {
    //       walletAddress, // TODO might need formatting to PP
    //       paymentMethodType
    //     }
    //   }
    // )

    const sepaDetails: SepaDetails = {
      iban: 'LT283250057737865181'
    }

    if (!sepaDetails.iban) {
      deps.logger.error(
        { walletAddress, paymentMethodType, data: sepaDetails },
        'SEPA details response missing required IBAN field'
      )
      return
    }

    return sepaDetails
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        deps.logger.error(
          { walletAddress, paymentMethodType, errorCode: error.code },
          'SEPA details service unavailable'
        )
        return
      }

      deps.logger.error(
        {
          walletAddress,
          paymentMethodType,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        },
        'Failed to fetch SEPA details'
      )
    } else {
      deps.logger.error(
        {
          walletAddress,
          paymentMethodType,
          errorMessage: error instanceof Error ? error.message : error
        },
        'Error fetching SEPA details'
      )
    }
    return
  }
}
//TODO Not used for now
async function getSepaFees(
  deps: ServiceDependencies,
  assetCode: string
): Promise<SepaFees | undefined> {
  // if (!deps.config.sepaDetailsUrl) {
  //   deps.logger.warn('SEPA_DETAILS_URL not configured, skipping SEPA fees fetch')
  //   return
  // }

  try {
    //TODO Using hardcoded fee for now

    const data = {}
    // const { data }: { data: SepaFees } = await deps.axios.get(
    //   `${deps.config.sepaDetailsUrl}/fees/${assetCode}`
    // )

    deps.logger.debug(
      { assetCode, feeStructure: data },
      'Received SEPA fees from external service'
    )
    // TODO Discuss general structure of fees since it may be different between integrators
    return data
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        deps.logger.error(
          { assetCode, errorCode: error.code },
          'SEPA fees service unavailable'
        )
        return
      }

      deps.logger.error(
        {
          assetCode,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        },
        'Failed to fetch SEPA fees'
      )
    } else {
      deps.logger.error(
        {
          assetCode,
          errorMessage: error instanceof Error ? error.message : error
        },
        'Error fetching SEPA fees'
      )
    }
    return
  }
}

async function refreshFees(deps: ServiceDependencies): Promise<void> {
  //TODO
  // if (!deps.config.sepaDetailsUrl) {
  //   deps.logger.warn('SEPA_DETAILS_URL not configured, skipping SEPA fees refresh')
  //   return
  // }

  try {
    //await deps.axios.post(`${deps.config.sepaDetailsUrl}/fees/refresh`)

    // TODO: Fee db update

    deps.logger.info('Successfully refreshed SEPA fees')
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        deps.logger.error(
          { errorCode: error.code },
          'SEPA fees refresh service unavailable'
        )
        return
      }

      deps.logger.error(
        {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        },
        'Failed to refresh SEPA fees'
      )
    } else {
      deps.logger.error(
        {
          errorMessage: error instanceof Error ? error.message : error
        },
        'Error refreshing SEPA fees'
      )
    }
  }
}
