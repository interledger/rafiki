import { BaseService } from '../../shared/baseService'
import {
  PaymentQuote,
  PaymentMethodService,
  StartQuoteOptions,
  PayOptions
} from '../handler/service'
import { RatesService } from '../../rates/service'
import { IlpPlugin, IlpPluginOptions } from './ilp_plugin'
import * as Pay from '@interledger/pay'
import { convertRatesToIlpPrices } from './rates'
import { IAppConfig } from '../../config/app'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../handler/errors'
import { TelemetryService } from '../../telemetry/service'

export interface IlpPaymentService extends PaymentMethodService {}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  ratesService: RatesService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
  telemetry?: TelemetryService
}

export async function createIlpPaymentService(
  deps_: ServiceDependencies
): Promise<IlpPaymentService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'IlpPaymentService' })
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
  const stopTimerRates = deps.telemetry?.startTimer(
    'ilp_get_quote_rate_time_ms',
    {
      description: 'Time to get rates'
    }
  )
  const rates = await deps.ratesService
    .rates(options.walletAddress.asset.code)
    .catch((_err: Error) => {
      stopTimerRates && stopTimerRates()
      throw new PaymentMethodHandlerError('Received error during ILP quoting', {
        description: 'Could not get rates from service',
        retryable: false
      })
    })

  stopTimerRates && stopTimerRates()

  const stopTimerPlugin = deps.telemetry?.startTimer(
    'ilp_make_ilp_plugin_time_ms',
    {
      description: 'Time to make ilp plugin'
    }
  )
  const plugin = deps.makeIlpPlugin({
    sourceAccount: options.walletAddress,
    unfulfillable: true
  })
  stopTimerPlugin && stopTimerPlugin()
  const destination = options.receiver.toResolvedPayment()

  try {
    const stopTimerConnect = deps.telemetry?.startTimer(
      'ilp_make_ilp_plugin_connect_time_ms',
      {
        description: 'Time to connect ilp plugin'
      }
    )
    await plugin.connect()
    stopTimerConnect && stopTimerConnect()
    const quoteOptions: Pay.QuoteOptions = {
      plugin,
      destination,
      sourceAsset: {
        scale: options.walletAddress.asset.scale,
        code: options.walletAddress.asset.code
      }
    }
    if (options.debitAmount) {
      quoteOptions.amountToSend = options.debitAmount.value
    } else {
      quoteOptions.amountToDeliver =
        options.receiveAmount?.value || options.receiver.incomingAmount?.value
    }

    let ilpQuote: Pay.Quote | undefined
    const stopTimerProbe = deps.telemetry?.startTimer(
      'ilp_rate_probe_time_ms',
      {
        description: 'Time to get an ILP quote (Pay.startQuote)'
      }
    )
    try {
      ilpQuote = await Pay.startQuote({
        ...quoteOptions,
        slippage: deps.config.slippage,
        prices: convertRatesToIlpPrices(rates)
      })
    } catch (err) {
      const errorMessage = 'Received error during ILP quoting'
      deps.logger.error({ err }, errorMessage)

      stopTimerProbe && stopTimerProbe()

      throw new PaymentMethodHandlerError(errorMessage, {
        description: Pay.isPaymentError(err) ? err : 'Unknown error',
        retryable: canRetryError(err as Error | Pay.PaymentError)
      })
    }
    stopTimerProbe && stopTimerProbe()
    // Pay.startQuote should return PaymentError.InvalidSourceAmount or
    // PaymentError.InvalidDestinationAmount for non-positive amounts.
    // Outgoing payments' sendAmount or receiveAmount should never be
    // zero or negative.
    if (ilpQuote.maxSourceAmount <= BigInt(0)) {
      throw new PaymentMethodHandlerError('Received error during ILP quoting', {
        description: 'Maximum source amount of ILP quote is non-positive',
        retryable: false
      })
    }

    if (ilpQuote.minDeliveryAmount <= BigInt(0)) {
      throw new PaymentMethodHandlerError('Received error during ILP quoting', {
        description: 'Minimum delivery amount of ILP quote is non-positive',
        retryable: false,
        code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
      })
    }

    // Because of how it does rounding, the Pay library allows getting a quote for a
    // maxSourceAmount that won't be able to fulfill even a single unit of the receiving asset.
    // e.g. if maxSourceAmount is 4 and the high estimated exchange rate is 0.2, 4 * 0.2 = 0.8
    // where 0.8 < 1, meaning the payment for this quote won't be able to deliver a single unit of value,
    // even with the most favourable exchange rate. We throw here since we don't want any payments
    // to be created against this quote. This allows us to fail early.
    const estimatedReceiveAmount =
      Number(ilpQuote.maxSourceAmount) *
      ilpQuote.highEstimatedExchangeRate.valueOf()

    if (estimatedReceiveAmount < 1) {
      const errorDescription =
        'Estimated receive amount of ILP quote is non-positive'
      deps.logger.debug(
        {
          minDeliveryAmount: ilpQuote.minDeliveryAmount,
          maxSourceAmount: ilpQuote.maxSourceAmount,
          estimatedReceiveAmount
        },
        errorDescription
      )
      throw new PaymentMethodHandlerError('Received error during ILP quoting', {
        description: errorDescription,
        retryable: false,
        code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
      })
    }

    return {
      receiver: options.receiver,
      walletAddress: options.walletAddress,
      estimatedExchangeRate: ilpQuote.lowEstimatedExchangeRate.valueOf(),
      debitAmount: {
        value: ilpQuote.maxSourceAmount,
        assetCode: options.walletAddress.asset.code,
        assetScale: options.walletAddress.asset.scale
      },
      receiveAmount: {
        value: ilpQuote.minDeliveryAmount,
        assetCode: options.receiver.assetCode,
        assetScale: options.receiver.assetScale
      },
      additionalFields: {
        lowEstimatedExchangeRate: ilpQuote.lowEstimatedExchangeRate,
        highEstimatedExchangeRate: ilpQuote.highEstimatedExchangeRate,
        minExchangeRate: ilpQuote.minExchangeRate,
        maxPacketAmount: ilpQuote.maxPacketAmount
      }
    }
  } finally {
    const stopTimerClose = deps.telemetry?.startTimer(
      'ilp_plugin_close_connect_time_ms',
      { description: 'Time to close ilp plugin' }
    )
    try {
      await Pay.closeConnection(plugin, destination)
      stopTimerClose && stopTimerClose()
    } catch (error) {
      deps.logger.warn(
        {
          destination: destination.destinationAddress,
          error: error instanceof Error && error.message
        },
        'close quote connection failed'
      )
      stopTimerClose && stopTimerClose()
    }

    try {
      await plugin.disconnect()
    } catch (error) {
      deps.logger.warn(
        { error: error instanceof Error && error.message },
        'error disconnecting ilp plugin'
      )
    }
  }
}

async function pay(
  deps: ServiceDependencies,
  options: PayOptions
): Promise<void> {
  const { receiver, outgoingPayment, finalDebitAmount, finalReceiveAmount } =
    options

  if (finalReceiveAmount <= 0n) {
    throw new PaymentMethodHandlerError('Could not start ILP streaming', {
      description: 'Invalid finalReceiveAmount',
      retryable: false
    })
  }

  if (finalDebitAmount <= 0n) {
    throw new PaymentMethodHandlerError('Could not start ILP streaming', {
      description: 'Invalid finalDebitAmount',
      retryable: false
    })
  }

  const {
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    minExchangeRate,
    maxPacketAmount
  } = outgoingPayment.quote

  const quote: Pay.Quote = {
    maxPacketAmount,
    paymentType: Pay.PaymentType.FixedDelivery,
    maxSourceAmount: finalDebitAmount,
    minDeliveryAmount: finalReceiveAmount,
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    minExchangeRate
  }

  const plugin = deps.makeIlpPlugin({
    sourceAccount: outgoingPayment
  })

  const destination = receiver.toResolvedPayment()

  try {
    const receipt = await Pay.pay({ plugin, destination, quote })

    if (receipt.error) {
      throw receipt.error
    }

    deps.logger.debug(
      {
        destination: destination.destinationAddress,
        error: receipt.error,
        finalDebitAmount,
        finalReceiveAmount,
        receiptAmountSent: receipt.amountSent,
        receiptAmountDelivered: receipt.amountDelivered
      },
      'ILP payment completed'
    )
  } catch (err) {
    const errorMessage = 'Received error during ILP pay'
    deps.logger.error(
      { err, destination: destination.destinationAddress },
      errorMessage
    )

    throw new PaymentMethodHandlerError(errorMessage, {
      description: Pay.isPaymentError(err) ? err : 'Unknown error',
      retryable: canRetryError(err as Error | Pay.PaymentError)
    })
  } finally {
    try {
      await Pay.closeConnection(plugin, destination)
    } catch (error) {
      deps.logger.warn(
        {
          destination: destination.destinationAddress,
          error: error instanceof Error && error.message
        },
        'close pay connection failed'
      )
    }

    try {
      await plugin.disconnect()
    } catch (error) {
      deps.logger.warn(
        { error: error instanceof Error && error.message },
        'error disconnecting plugin'
      )
    }
  }
}

export function canRetryError(err: Error | Pay.PaymentError): boolean {
  return err instanceof Error || !!retryableIlpErrors[err]
}

export const retryableIlpErrors: {
  [paymentError in Pay.PaymentError]?: boolean
} = {
  [Pay.PaymentError.ConnectorError]: true,
  [Pay.PaymentError.EstablishmentFailed]: true,
  [Pay.PaymentError.InsufficientExchangeRate]: true,
  [Pay.PaymentError.RateProbeFailed]: true,
  [Pay.PaymentError.IdleTimeout]: true,
  [Pay.PaymentError.ClosedByReceiver]: true
}
