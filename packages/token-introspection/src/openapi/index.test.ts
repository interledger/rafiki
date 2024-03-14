import { getTokenIntrospectionOpenAPI } from '.'

describe.skip('OpenAPI', (): void => {
  describe('getResourceServerOpenAPI', () => {
    test('properly generates API paths', async () => {
      const openApi = await getTokenIntrospectionOpenAPI()

      expect(openApi).toBeDefined()
      expect(Object.keys(openApi.paths)).toEqual(
        expect.arrayContaining([
          '/incoming-payments',
          '/outgoing-payments',
          '/quotes',
          '/incoming-payments/{id}',
          '/incoming-payments/{id}/complete',
          '/outgoing-payments/{id}',
          '/quotes/{id}'
        ])
      )
    })

    // test('properly references $ref to external ./schemas.yaml', async () => {
    //   const openApi = await getResourceServerOpenAPI()

    //   expect(
    //     Object.keys(
    //       openApi.paths?.['/incoming-payments']?.['post']?.['requestBody']?.[
    //         'content'
    //       ]['application/json']['schema']['properties']['incomingAmount'][
    //         'properties'
    //       ]
    //     ).sort()
    //   ).toEqual(['assetCode', 'assetScale', 'value'].sort())
    // })
  })
})
