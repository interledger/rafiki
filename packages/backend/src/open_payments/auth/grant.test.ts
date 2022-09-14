import { Grant, AccessType, AccessAction, getInterval } from './grant'
import { Interval } from 'luxon'
import { v4 as uuid } from 'uuid'

describe('Grant', (): void => {
  describe('includesAccess', (): void => {
    let grant: Grant
    const type = AccessType.IncomingPayment
    const action = AccessAction.Create
    const clientId = uuid()

    describe.each`
      identifier                        | description
      ${'https://wallet.example/alice'} | ${'account identifier'}
      ${undefined}                      | ${'no identifier'}
    `('$description', ({ identifier }): void => {
      beforeAll((): void => {
        grant = new Grant({
          active: true,
          grant: 'PRY5NM33OM4TB8N6BW7',
          clientId,
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
        superAction             | subAction            | description
        ${AccessAction.ReadAll} | ${AccessAction.Read} | ${'read'}
        ${AccessAction.ListAll} | ${AccessAction.List} | ${'list'}
      `(
        'Returns true for $description super access',
        async ({ superAction, subAction }): Promise<void> => {
          const grant = new Grant({
            active: true,
            grant: 'PRY5NM33OM4TB8N6BW7',
            clientId,
            access: [
              {
                type,
                actions: [superAction],
                identifier
              }
            ]
          })
          expect(
            grant.includesAccess({
              type,
              action: subAction,
              identifier
            })
          ).toBe(true)
        }
      )

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
  describe.each`
    interval                         | description
    ${'R2/2022-07-01T13:00:00Z/P1M'} | ${'parses a repeating interval / start + duration'}
    ${'R2/P1M/2022-10-01T13:00:00Z'} | ${'parses a repeating interval / duration + end'}
  `('$description', ({ interval }): void => {
    it.each`
      target                    | expected                      | time
      ${'2022-07-01T12:59:59'}  | ${undefined}                  | ${'before start'}
      ${'2022-07-01T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P1M'} | ${'at start'}
      ${'2022-07-10T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P1M'} | ${'during first interval'}
      ${'2022-08-10T13:00:00Z'} | ${'2022-08-01T13:00:00Z/P1M'} | ${'during second interval'}
      ${'2022-09-10T13:00:00Z'} | ${'2022-09-01T13:00:00Z/P1M'} | ${'during third interval'}
      ${'2022-10-01T12:59:59Z'} | ${'2022-09-01T13:00:00Z/P1M'} | ${'before end'}
      ${'2022-10-01T13:00:00Z'} | ${undefined}                  | ${'at end'}
    `('- $time', ({ target, expected }): void => {
      expect(getInterval(interval, new Date(target))).toEqual(
        expected ? Interval.fromISO(expected) : undefined
      )
    })
  })
  it.each`
    target                    | expected                       | time
    ${'2022-07-01T12:59:59'}  | ${undefined}                   | ${'before start'}
    ${'2022-07-01T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P31D'} | ${'at start'}
    ${'2022-07-10T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P31D'} | ${'during first interval'}
    ${'2022-08-10T13:00:00Z'} | ${'2022-08-01T13:00:00Z/P31D'} | ${'during second interval'}
    ${'2022-09-10T13:00:00Z'} | ${'2022-09-01T13:00:00Z/P31D'} | ${'during third interval'}
    ${'2022-10-02T12:59:59Z'} | ${'2022-09-01T13:00:00Z/P31D'} | ${'before end'}
    ${'2022-10-02T13:00:00Z'} | ${undefined}                   | ${'at end'}
  `(
    'parses a repeating interval / start + end - $time',
    ({ target, expected }): void => {
      expect(
        getInterval(
          'R2/2022-07-01T13:00:00Z/2022-08-01T13:00:00Z',
          new Date(target)
        )
      ).toEqual(
        expected ? Interval.fromISO(expected) : undefined
        // note that the durations are always 31 days because the first interval has 31 days
      )
    }
  )
  describe.each`
    interval                          | description
    ${'R/2022-07-01T13:00:00Z/P1M'}   | ${'R'}
    ${'R-1/2022-07-01T13:00:00Z/P1M'} | ${'R-1'}
  `(
    'parses an infinitely repeating interval ($description) / start + duration',
    ({ interval }): void => {
      it.each`
        target                    | expected                      | time
        ${'2022-07-01T12:59:59'}  | ${undefined}                  | ${'before start'}
        ${'2022-07-01T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P1M'} | ${'at start'}
        ${'2022-07-10T13:00:00Z'} | ${'2022-07-01T13:00:00Z/P1M'} | ${'during first interval'}
        ${'2022-08-10T13:00:00Z'} | ${'2022-08-01T13:00:00Z/P1M'} | ${'during second interval'}
        ${'2032-01-10T13:00:00Z'} | ${'2032-01-01T13:00:00Z/P1M'} | ${'far in future'}
      `('- $time', ({ target, expected }): void => {
        expect(getInterval(interval, new Date(target))).toEqual(
          expected ? Interval.fromISO(expected) : undefined
        )
      })
    }
  )
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
