import { Pojo, Model, ModelOptions, QueryContext } from 'objection'
import * as Pay from '@interledger/pay'
import { Account } from '../account/model'
import { BaseModel } from '../shared/baseModel'

const fieldPrefixes = ['intent', 'quote', 'destinationAccount', 'outcome']

const ratioFields = [
  'quoteMinExchangeRate',
  'quoteLowExchangeRateEstimate',
  'quoteHighExchangeRateEstimate'
]

export type PaymentIntent = {
  paymentPointer?: string
  invoiceUrl?: string
  amountToSend?: bigint
  autoApprove: boolean
}

export class OutgoingPayment extends BaseModel {
  public static readonly tableName = 'outgoingPayments'

  public state!: PaymentState
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number

  public intent!: PaymentIntent

  public quote?: {
    timestamp: Date
    activationDeadline: Date
    targetType: Pay.PaymentType
    minDeliveryAmount: bigint
    maxSourceAmount: bigint
    maxPacketAmount: bigint
    minExchangeRate: Pay.Ratio
    lowExchangeRateEstimate: Pay.Ratio
    // Note that the upper exchange rate bound is *exclusive*.
    // (Pay.PositiveRatio, but validated later)
    highExchangeRateEstimate: Pay.Ratio
  }
  public accountId!: string
  public account!: Account
  public sourceAccountId!: string
  public destinationAccount!: {
    scale: number
    code: string
    url?: string
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'outgoingPayments.accountId',
        to: 'accounts.id'
      }
    }
  }

  $beforeUpdate(opts: ModelOptions, queryContext: QueryContext): void {
    super.$beforeUpdate(opts, queryContext)
    if (
      opts.old &&
      opts.old['error'] &&
      this.state &&
      this.state !== PaymentState.Refunding &&
      this.state !== PaymentState.Cancelled
    ) {
      this.error = null
    }
    if (opts.old && this.state && opts.old['state'] !== this.state) {
      this.stateAttempts = 0
    }
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    for (const prefix of fieldPrefixes) {
      if (!json[prefix]) continue
      for (const key in json[prefix]) {
        json[prefix + key.charAt(0).toUpperCase() + key.slice(1)] =
          json[prefix][key]
      }
      delete json[prefix]
    }
    ratioFields.forEach((ratioField: string) => {
      if (!json[ratioField]) return
      json[ratioField + 'Numerator'] = json[ratioField].a.value
      json[ratioField + 'Denominator'] = json[ratioField].b.value
      delete json[ratioField]
    })
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    json = super.$parseDatabaseJson(json)
    ratioFields.forEach((ratioField: string) => {
      if (
        json[ratioField + 'Numerator'] === null ||
        json[ratioField + 'Denominator'] === null
      ) {
        return
      }
      json[ratioField] = Pay.Ratio.of(
        Pay.Int.from(json[ratioField + 'Numerator']),
        Pay.Int.from(json[ratioField + 'Denominator'])
      )
      delete json[ratioField + 'Numerator']
      delete json[ratioField + 'Denominator']
    })
    for (const key in json) {
      const prefix = fieldPrefixes.find((prefix) => key.startsWith(prefix))
      if (!prefix) continue
      if (json[key] !== null) {
        if (!json[prefix]) json[prefix] = {}
        json[prefix][
          key.charAt(prefix.length).toLowerCase() + key.slice(prefix.length + 1)
        ] = json[key]
      }
      delete json[key]
    }
    return json
  }
}

export enum PaymentState {
  // Initial state. In this state, an empty trustline account is generated, and the payment is automatically resolved & quoted.
  // On success, transition to `Ready`.
  // On failure, transition to `Refunding`.
  Inactive = 'Inactive',
  // Awaiting user approval. Approval is automatic if `intent.autoApprove` is set.
  // Once approved, transitions to `Funding`.
  Ready = 'Ready',
  // Awaiting money from the user's wallet account to be deposited to the payment account to reserve it for the payment.
  // On success, transition to `Sending`.
  Funding = 'Funding',
  // Pay from the trustline account to the destination.
  // On success, transition to `Refunding`.
  Sending = 'Sending',

  // Awaiting leftover reserved money to be refunded to the wallet account.
  // On successful refunding, transition to Cancelled (payment error) or Completed (no payment error).
  Refunding = 'Refunding',
  // The payment failed. (Though some money may have been delivered).
  // Requoting transitions to `Inactive`.
  Cancelled = 'Cancelled',
  // Successful completion.
  Completed = 'Completed'
}
