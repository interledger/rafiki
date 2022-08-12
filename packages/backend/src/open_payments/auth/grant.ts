import assert from 'assert'
import { Interval, Duration, DateTime, Settings } from 'luxon'

import { Amount } from '../amount'

Settings.defaultZone = 'utc'

interface AmountJSON {
  value: string
  assetCode: string
  assetScale: number
}

export enum AccessType {
  Account = 'account',
  IncomingPayment = 'incoming-payment',
  OutgoingPayment = 'outgoing-payment',
  Quote = 'quote'
}

export enum AccessAction {
  Create = 'create',
  Read = 'read',
  Complete = 'complete',
  List = 'list'
}

export interface AccessLimits {
  receiver?: string
  sendAmount?: Amount
  receiveAmount?: Amount
  description?: string
  externalRef?: string
}

interface AccessLimitsJSON {
  receiver?: string
  sendAmount?: AmountJSON
  receiveAmount?: AmountJSON
}

export interface GrantAccess {
  type: AccessType
  actions: AccessAction[]
  identifier?: string
  interval?: string
  limits?: AccessLimits
}

export type GrantAccessJSON = Omit<GrantAccess, 'limits'> & {
  limits?: AccessLimitsJSON
}

export interface GrantOptions {
  active: boolean
  grant: string
  access?: GrantAccess[]
}

export type GrantJSON = Omit<GrantOptions, 'access'> & {
  access?: GrantAccessJSON[]
}

export class Grant {
  constructor(options: GrantOptions) {
    assert.ok(options.access || !options.active)
    this.active = options.active
    this.grant = options.grant
    this.access = options.access || []
  }

  public readonly active: boolean
  public readonly grant: string
  public readonly access: GrantAccess[]

  public includesAccess({
    type,
    action,
    identifier
  }: {
    type: AccessType
    action: AccessAction
    identifier: string
  }): boolean {
    return !!this.access?.find(
      (access) =>
        access.type === type &&
        (!access.identifier || access.identifier === identifier) &&
        access.actions.includes(action) &&
        (!access.interval ||
          getInterval(access.interval, new Date()) !== undefined)
    )
  }

  public getAccess({
    type,
    identifier,
    action
  }: {
    type?: AccessType
    identifier?: string
    action?: AccessAction
  }): GrantAccess[] {
    return this.access.filter((access) => {
      if (type && access.type !== type) {
        return false
      }
      if (identifier && access.identifier !== identifier) {
        return false
      }
      if (action && !access.actions.includes(action)) {
        return false
      }
      if (
        access.interval &&
        getInterval(access.interval, new Date()) === undefined
      ) {
        return false
      }
      return true
    })
  }

  public toJSON(): GrantJSON {
    return {
      active: this.active,
      grant: this.grant,
      access: this.access?.map((access) => {
        return {
          ...access,
          limits: access.limits && {
            ...access.limits,
            sendAmount: access.limits.sendAmount && {
              ...access.limits.sendAmount,
              value: access.limits.sendAmount.value.toString()
            },
            receiveAmount: access.limits.receiveAmount && {
              ...access.limits.receiveAmount,
              value: access.limits.receiveAmount.value.toString()
            }
          }
        }
      })
    }
  }
}

// Export for testing
export function getInterval(
  repeatingInterval: string,
  target: Date
): Interval | undefined {
  const parts = repeatingInterval.split('/')
  assert.ok(parts.length === 3)

  let repetitions: number | undefined
  if (parts[0].length > 1 && parts[0][1] !== '-') {
    repetitions = Number(parts[0].slice(1))
  } else if (['R', 'R-1'].includes(parts[0])) {
    repetitions = Infinity
  }
  if (repetitions === undefined || isNaN(repetitions)) return

  let interval = Interval.fromISO(`${parts[1]}/${parts[2]}`)
  if (!interval.isValid || !interval.start) return
  if (interval.contains(DateTime.fromJSDate(target))) return interval

  let duration: Duration
  let forward: boolean
  if (parts[1].length > 1 && parts[1][0] === 'P') {
    duration = Duration.fromISO(parts[1])
    forward = false
  } else if (parts[2].length > 1 && parts[2][0] === 'P') {
    duration = Duration.fromISO(parts[2])
    forward = true
  } else {
    duration = Duration.fromISO(interval.toDuration().toString())
    forward = true
  }

  if (forward && interval.isAfter(DateTime.fromJSDate(target))) return undefined
  if (!forward && interval.isBefore(DateTime.fromJSDate(target)))
    return undefined

  for (let i = 1; i < repetitions + 1; i++) {
    let nextInterval: Interval
    if (forward) {
      nextInterval = Interval.after(interval.end, duration)
    } else {
      nextInterval = Interval.before(interval.start, duration)
    }
    if (nextInterval.contains(DateTime.fromJSDate(target))) return nextInterval
    interval = nextInterval
  }
}
