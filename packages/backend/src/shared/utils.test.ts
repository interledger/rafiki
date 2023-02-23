import { isValidHttpUrl } from './utils'

describe('utils', (): void => {
  describe('isValidHttpUrl', (): void => {
    test.each`
      url                         | result   | type
      ${''}                       | ${false} | ${'invalid'}
      ${undefined}                | ${false} | ${'invalid'}
      ${{}}                       | ${false} | ${'invalid'}
      ${'mailto:john@doe.com'}    | ${false} | ${'invalid'}
      ${'ftp://0.0.0.0@0.0.0.0'}  | ${false} | ${'invalid'}
      ${'javascript:void(0)'}     | ${false} | ${'invalid'}
      ${'http://'}                | ${false} | ${'invalid'}
      ${'HTTP://.com'}            | ${false} | ${'invalid'}
      ${'http://foo'}             | ${true}  | ${'valid'}
      ${'http://foo.bar.baz.com'} | ${true}  | ${'valid'}
      ${'http://peer.test:3000'}  | ${true}  | ${'valid'}
    `('returns $result for $type HTTP url', ({ url, result }): void => {
      expect(isValidHttpUrl(url)).toEqual(result)
    })
  })
})
