import { BaseService } from '../../shared/baseService'
import {
  PaymentQuote,
  PaymentProcessorService,
  StartQuoteOptions
} from '../service'
import { RatesService } from '../../rates/service'
import { IlpPlugin, IlpPluginOptions } from './ilp_plugin'
import * as Pay from '@interledger/pay'
import { convertRatesToIlpPrices } from './rates'
import { IAppConfig } from '../../config/app'

export interface IlpPaymentService extends PaymentProcessorService {}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  ratesService: RatesService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
}

export async function createIlpPaymentService(
  deps_: ServiceDependencies
): Promise<IlpPaymentService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'IlpPaymentService' })
  }

  return {
    getQuote: (quoteOptions) => getQuote(deps, quoteOptions)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  options: StartQuoteOptions
): Promise<PaymentQuote> {
  const rates = await deps.ratesService
    .rates(options.paymentPointer.asset.code)
    .catch((_err: Error) => {
      throw new Error('missing rates')
    })

  const plugin = deps.makeIlpPlugin({
    sourceAccount: options.paymentPointer,
    unfulfillable: true
  })

  try {
    await plugin.connect()
    const quoteOptions: Pay.QuoteOptions = {
      plugin,
      destination: options.receiver.toResolvedPayment(),
      sourceAsset: {
        scale: options.paymentPointer.asset.scale,
        code: options.paymentPointer.asset.code
      }
    }
    if (options.debitAmount) {
      quoteOptions.amountToSend = options.debitAmount.value
    } else {
      quoteOptions.amountToDeliver =
        options.receiveAmount?.value || options.receiver.incomingAmount?.value
    }

    let ilpQuote: Pay.Quote | undefined
    try {
      ilpQuote = await Pay.startQuote({
        ...quoteOptions,
        slippage: deps.config.slippage,
        prices: convertRatesToIlpPrices(rates)
      })
    } finally {
      await Pay.closeConnection(
        quoteOptions.plugin,
        quoteOptions.destination
      ).catch((err) => {
        deps.logger.warn(
          {
            destination: quoteOptions.destination.destinationAddress,
            error: err.message
          },
          'close quote connection failed'
        )
      })
    }

    // Pay.startQuote should return PaymentError.InvalidSourceAmount or
    // PaymentError.InvalidDestinationAmount for non-positive amounts.
    // Outgoing payments' sendAmount or receiveAmount should never be
    // zero or negative.
    if (ilpQuote.maxSourceAmount <= BigInt(0)) {
      throw new Error('Invalid maxSourceAmount in ILP quote')
    }

    if (ilpQuote.minDeliveryAmount <= BigInt(0)) {
      throw new Error('Invalid minDeliveryAmount in ILP quote')
    }

    return {
      receiver: options.receiver,
      paymentPointer: options.paymentPointer,
      debitAmount: {
        value: ilpQuote.maxSourceAmount,
        assetCode: options.paymentPointer.asset.code,
        assetScale: options.paymentPointer.asset.scale
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
