import { Interval } from 'luxon'

import { getInterval } from './limits'

describe('Outgoing Payment limits', (): void => {
  describe('getInterval', (): void => {
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
})
