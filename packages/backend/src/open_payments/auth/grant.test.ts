import { Grant, AccessType, AccessAction } from './grant'

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
