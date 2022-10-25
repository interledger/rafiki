import assert from 'assert'
import { Interval, Duration, DateTime, Settings } from 'luxon'

import { Amount } from '../amount'

Settings.defaultZone = 'utc'

interface AmountJSON {
  value: string
  assetCode: string
  assetScale: number
}

// TODO: replace with open-payments generated types
export enum AccessType {
  IncomingPayment = 'incoming-payment',
  OutgoingPayment = 'outgoing-payment',
  Quote = 'quote'
}

export enum AccessAction {
  Create = 'create',
  Read = 'read',
  ReadAll = 'read-all',
  Complete = 'complete',
  List = 'list',
  ListAll = 'list-all'
}

export interface AccessLimits {
  receiver?: string
  sendAmount?: Amount
  receiveAmount?: Amount
  interval?: string
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
  clientId: string
  access?: GrantAccess[]
}

export interface GrantJSON {
  active: boolean
  grant: string
  client_id: string
  access?: GrantAccessJSON[]
}

export class Grant {
  constructor(options: GrantOptions) {
    assert.ok(options.access || !options.active)
    this.active = options.active
    this.grant = options.grant
    this.access = options.access || []
    this.clientId = options.clientId
  }

  public readonly active: boolean
  public readonly grant: string
  public readonly access: GrantAccess[]
  public readonly clientId: string

  public findAccess({
    type,
    action,
    identifier
  }: {
    type: AccessType
    action: AccessAction
    identifier: string
  }): GrantAccess | undefined {
    return this.access?.find(
      (access) =>
        access.type === type &&
        (!access.identifier || access.identifier === identifier) &&
        (access.actions.includes(action) ||
          (action === AccessAction.Read &&
            access.actions.includes(AccessAction.ReadAll)) ||
          (action === AccessAction.List &&
            access.actions.includes(AccessAction.ListAll)))
    )
  }

  public toJSON(): GrantJSON {
    return {
      active: this.active,
      grant: this.grant,
      client_id: this.clientId,
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
