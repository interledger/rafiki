import assert from 'assert'
import { Duration, parse, end } from 'iso8601-duration'

import { Amount } from '../amount'

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
  Update = 'update',
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

  // TODO: check interval
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
        access.actions.includes(action)
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

export interface Interval {
  start: Date
  end: Date
}

function parseDuration(duration: string): Duration | undefined {
  try {
    return parse(duration)
  } catch (_err) {
    return undefined
  }
}

export function getInterval(
  repeatingInterval: string,
  target: Date
): Interval | undefined {
  const parts = repeatingInterval.split('/')
  assert.ok(parts.length === 3)
  let repetitions: number | undefined
  if (parts[0].length > 1 && parts[0][1] !== '-') {
    repetitions = Number(parts[0].slice(1))
  }
  const forwardDuration = parseDuration(parts[2])
  if (forwardDuration) {
    let intervalStart = new Date(parts[1])
    if (target.getTime() < intervalStart.getTime()) {
      return undefined
    }
    let intervalEnd = end(forwardDuration, intervalStart)
    for (let i = 0; !repetitions || i < repetitions; i++) {
      intervalStart = intervalEnd
      intervalEnd = end(forwardDuration, intervalStart)
      if (target.getTime() < intervalEnd.getTime()) {
        return {
          start: intervalStart,
          end: intervalEnd
        }
      }
    }
    return undefined
  } else {
    // TODO: backwards duration
    return undefined
  }
}
