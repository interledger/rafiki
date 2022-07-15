import { Grant, AccessType, AccessAction, getInterval } from './grant'
import { Interval } from 'luxon'

describe('Grant', (): void => {
  describe('includesAccess', (): void => {
    let grant: Grant
    const type = AccessType.IncomingPayment
    const action = AccessAction.Create

    describe.each`
      identifier                        | description
      ${'https://wallet.example/alice'} | ${'account identifier'}
      ${undefined}                      | ${'no identifier'}
    `('$description', ({ identifier }): void => {
      beforeAll((): void => {
        grant = new Grant({
          active: true,
          grant: 'PRY5NM33OM4TB8N6BW7',
          access: [
            {
              type: AccessType.OutgoingPayment,
              actions: [AccessAction.Read],
              identifier: 'https://wallet.example/bob'
            },
            {
              type,
              actions: [AccessAction.Read, action],
              identifier
            }
          ]
        })
      })

      test('Returns true for included access', async (): Promise<void> => {
        expect(
          grant.includesAccess({
            type,
            action,
            identifier
          })
        ).toBe(true)
      })

      test.each`
        type                          | action                   | identifier    | description
        ${AccessType.OutgoingPayment} | ${action}                | ${identifier} | ${'type'}
        ${type}                       | ${AccessAction.Complete} | ${identifier} | ${'action'}
      `(
        'Returns false for missing $description',
        async ({ type, action, identifier }): Promise<void> => {
          expect(
            grant.includesAccess({
              type,
              action,
              identifier
            })
          ).toBe(false)
        }
      )

      if (identifier) {
        test('Returns false for missing identifier', async (): Promise<void> => {
          expect(
            grant.includesAccess({
              type,
              action,
              identifier: 'https://wallet.example/bob'
            })
          ).toBe(false)
        })
      } else {
        test('Returns true for unrestricted identifier', async (): Promise<void> => {
          expect(
            grant.includesAccess({
              type,
              action,
              identifier: 'https://wallet.example/bob'
            })
          ).toBe(true)
        })
      }
    })
  })
})

describe('Interval', (): void => {
  it('parses a repeating interval / start + duration', (): void => {
    expect(
      getInterval('R2/2022-07-01T13:00:00Z/P1M', new Date('2022-08-19'))
    ).toEqual(Interval.fromISO('2022-08-01T13:00:00Z/P1M'))
  })
  it('parses a repeating interval / duration + end', (): void => {
    expect(
      getInterval('R2/P1M/2022-07-01T13:00:00Z', new Date('2022-04-22'))
    ).toEqual(Interval.fromISO('2022-04-01T13:00:00Z/P1M'))
  })
  it('parses a repeating interval / start + end', (): void => {
    expect(
      getInterval(
        'R2/2022-07-01T13:00:00Z/2022-08-01T13:00:00Z',
        new Date('2022-08-19')
      )
    ).toEqual(
      Interval.fromISO('2022-08-01T13:00:00Z/P31D')
      // note that the durations are always 31 days because the first interval has 31 days
    )
  })
  it('parses a non-repeating repeating interval / start + duration', (): void => {
    expect(
      getInterval('R0/2022-07-01T13:00:00Z/P1M', new Date('2022-07-17'))
    ).toEqual(Interval.fromISO('2022-07-01T13:00:00Z/P1M'))
  })
  it('parses an infinitely repeating interval / start + duration', (): void => {
    expect(
      getInterval('R/2022-07-01T13:00:00Z/P1M', new Date('2022-09-19'))
    ).toEqual(Interval.fromISO('2022-09-01T13:00:00Z/P1M'))
    expect(
      getInterval('R-1/2022-07-01T13:00:00Z/P1M', new Date('2022-09-19'))
    ).toEqual(Interval.fromISO('2022-09-01T13:00:00Z/P1M'))
  })
  it('returns undefined if date not in intervals', (): void => {
    expect(
      getInterval('R0/2022-07-01T13:00:00Z/P1M', new Date('2022-08-19'))
    ).toBeUndefined()
  })
  it('cannot parse a misspecified repeating interval / start + duration', (): void => {
    expect(
      getInterval('R4/2022-07-01T:13:00:00Z/P1M', new Date('2022-08-19'))
    ).toBeUndefined()
    expect(
      getInterval('R4/2022-07-01Z13:00:00T/P1M', new Date('2022-08-19'))
    ).toBeUndefined()
    expect(
      getInterval('R4/2022-07-01T13-00-00Z/P1M', new Date('2022-08-19'))
    ).toBeUndefined()
    expect(
      getInterval('Rn/2022-07-01T13:00:00Z/P1M', new Date('2022-08-19'))
    ).toBeUndefined()
  })
})
