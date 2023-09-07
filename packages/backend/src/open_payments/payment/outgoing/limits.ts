import { Interval, Duration, DateTime, Settings } from 'luxon'

import { Amount, AmountJSON, parseAmount } from '../../amount'

Settings.defaultZone = 'utc'

export interface AccessLimits {
  receiver?: string
  debitAmount?: AmountJSON
  receiveAmount?: AmountJSON
  interval?: string
}

export type Limits = Omit<AccessLimits, 'debitAmount' | 'receiveAmount'> & {
  debitAmount?: Amount
  receiveAmount?: Amount
}

export const parseLimits = (limits: AccessLimits): Limits => ({
  ...limits,
  debitAmount: limits.debitAmount && parseAmount(limits.debitAmount),
  receiveAmount: limits.receiveAmount && parseAmount(limits.receiveAmount)
})

// Export for testing
export function getInterval(
  repeatingInterval: string,
  target: Date
): Interval | undefined {
  const parts = repeatingInterval.split('/')
  if (parts.length !== 3) {
    throw new Error('invalid repearting interval')
  }

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
    duration = interval.toDuration()
    forward = true
  }

  if (forward && interval.isAfter(DateTime.fromJSDate(target))) return undefined
  if (!forward && interval.isBefore(DateTime.fromJSDate(target)))
    return undefined

  for (let i = 1; i < repetitions + 1; i++) {
    let nextInterval: Interval
    if (interval.start === null || interval.end === null) return
    if (forward) {
      nextInterval = Interval.after(interval.end, duration)
    } else {
      nextInterval = Interval.before(interval.start, duration)
    }
    if (nextInterval.contains(DateTime.fromJSDate(target))) return nextInterval
    interval = nextInterval
  }
}
