import { BaseService } from '../../shared/baseService'
import {
  PaymentQuote,
  PaymentMethodService,
  StartQuoteOptions,
  PayOptions
} from '../handler/service'
import { isConvertError, RatesService } from '../../rates/service'
import { IAppConfig } from '../../config/app'
import { PaymentMethodHandlerError } from '../handler/errors'
import {
  AccountingService,
  LiquidityAccountType,
  TransferOptions,
  TransferType
} from '../../accounting/service'
import {
  AccountAlreadyExistsError,
  isTransferError,
  TransferError
} from '../../accounting/errors'
import { InsufficientLiquidityError } from 'ilp-packet/dist/errors'
import { IncomingPaymentService } from '../../open_payments/payment/incoming/service'
import { IncomingPaymentState } from '../../open_payments/payment/incoming/model'
import { FeeService } from '../../fee/service'
import { Fee } from '../../fee/model'

export interface LocalPaymentService extends PaymentMethodService {}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  ratesService: RatesService
  accountingService: AccountingService
  incomingPaymentService: IncomingPaymentService
  feeService: FeeService
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
  // let estimatedExchangeRate: number

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
    estimatedExchangeRate: Number(receiveAmountValue / debitAmountValue),
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
  const { outgoingPayment, receiver, finalDebitAmount, finalReceiveAmount } =
    options
  if (!outgoingPayment.quote.sourceAmount) {
    // TODO: handle this better. perhaps sourceAmount should not be nullable?
    // If throwing an error, follow existing patterns
    throw new Error('could do local pay, missing sourceAmount')
  }

  // Cannot directly use receiver/receiver.incomingAccount for destinationAccount.
  // createTransfer Expects LiquidityAccount (gets Peer in ilp).
  const incomingPaymentId = receiver.incomingPayment.id.split('/').pop()
  if (!incomingPaymentId) {
    throw new PaymentMethodHandlerError('Received error during local payment', {
      description: 'Incoming payment not found from receiver',
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

  // TODO: anything more needed from balance middleware?
  // Necessary to avoid `UnknownDestinationAccount` error
  // TODO: remove incoming state check? perhaps only applies ilp account middleware where its checking many different things
  if (incomingPayment.state === IncomingPaymentState.Pending) {
    try {
      await deps.accountingService.createLiquidityAccount(
        incomingPayment,
        LiquidityAccountType.INCOMING
      )
      deps.logger.debug(
        { incomingPayment },
        'Created liquidity account for local incoming payment'
      )
    } catch (err) {
      if (!(err instanceof AccountAlreadyExistsError)) {
        deps.logger.error(
          { incomingPayment, err },
          'Failed to create liquidity account for local incoming payment'
        )
        throw err
      }
    }
  }

  console.log('pay fee', outgoingPayment.quote.fee)
  console.log('pay feeid', outgoingPayment.quote.feeId)

  // let feeAmount: number | null

  // baseDebitAmount excludes fees
  let sourceAmount = outgoingPayment.quote.sourceAmount //finalDebitAmount

  console.log({ finalDebitAmount, sourceAmount, finalReceiveAmount })

  // if (outgoingPayment.quote.feeId) {
  //   const fee = await deps.feeService.getById(outgoingPayment.quote.feeId)

  //   if (!fee) {
  //     throw new PaymentMethodHandlerError(
  //       'Received error during local payment',
  //       {
  //         description: 'Quote fee could not be found by id',
  //         retryable: false
  //       }
  //     )
  //   }

  //   // TODO: store this on quote instead?
  //   // Original debit amount value excluding fees
  //   sourceAmount = BigInt(
  //     Math.floor(
  //       Number(finalDebitAmount - fee.fixedFee) /
  //         (1 + fee.basisPointFee / 10000)
  //     )
  //   )
  // }

  // TODO: is this going to work for fixed send/delivery?
  // At this stage does that concept still have an effect? in ilp pay I
  // think its all fixed delivery here...

  // [x] Use finalDebitAmount - fees for sourceAmount and finalReceiveAmount for destinationAmount
  // ilp pay is sending min of debitAmount/converted min delivery (finalReceiveAmount)

  // extra things to verify:
  // - [X] before implenting this, ensure transfersToCreateOrError 110 amt destinationAccontId is the us asset account
  //   - IT DOES MATCH. the destinationAccontId for the 110 amt corresponds to USD asset id
  //   - 110 record had destinationAccountId: 7b628461-0d45-4cd5-9b2d-ec6de9fe8159
  //   - ledgerAccount had 2 records with accountRef: 7b628461-0d45-4cd5-9b2d-ec6de9fe8159.
  //     1 with type SETTLEMENT and another with type LIQUIDITY_ASSET
  //   - USD asset had id of 7b628461-0d45-4cd5-9b2d-ec6de9fe8159
  // - [ ] after implementing, ensure there are 3 transfers made for cross currency:
  //    - 1 outgoing payment to usd asset
  //    - 1 usd asset to fx asset
  //    - 1 fx asset to incoming payment

  // const fee = await deps.feeService.get(outgoingPayment.quote.feeId)

  const transferOptions: TransferOptions = {
    // outgoingPayment.quote.debitAmount = 610n
    // outgoingPayment.quote.receiveAmount = 500n
    // ^ consistent with ilp payment method
    sourceAccount: outgoingPayment,
    destinationAccount: incomingPayment,
    // finalDebitAmount: 610n
    // finalReceiveAmount: 500n
    // ^ consistent with amounts passed into ilpPaymentMethodService.pay and Pay.pay
    // ^ inconsisten with transfer passed into createTrasnfer in balance middleware
    //   - that is sourceAmount: 500, destinationAmount: 500
    //   - this transfer gets 500 from the request.prepare (formed from Pay.pay?). request.prepare
    //     is the sourceAmount then the destinationAmount is derived from it with rates.convert
    sourceAmount,
    destinationAmount: finalReceiveAmount,
    transferType: TransferType.TRANSFER
  }

  // Here, createTransfer gets debitAmount = 610 and receiveAmount =  500n
  // however, in ilp balance middleware its 500/500. In ilpPaymentService.pay,
  // Pay.pay is called with the same sort of quote as here. debitAmount = 617 (higher due to slippage?)
  // and receiveAmount =  500. There is some adjustment happening between Pay.pay (in Pay.pay?)
  // (in ilpPaymentMethodService.pay) and createTransfer in the connector balance middleware
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
        throw new InsufficientLiquidityError(trxOrError)
      default:
        throw new Error('Unknown error while trying to create transfer')
    }
  }
  await trxOrError.post()
}
