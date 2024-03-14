import { getTokenIntrospectionOpenAPI } from '.'

describe('OpenAPI', (): void => {
  describe('getTokenIntrospectionOpenAPI', () => {
    test('properly generates API paths', async () => {
      const openApi = await getTokenIntrospectionOpenAPI()

      expect(openApi).toBeDefined()
      expect(Object.keys(openApi.paths)).toEqual(expect.arrayContaining(['/']))
    })

    test('properly references $ref to external ./schemas.yaml', async () => {
      const openApi = await getTokenIntrospectionOpenAPI()

      expect(
        openApi.paths?.['/']?.['post']?.['requestBody']?.['content'][
          'application/json'
        ]['schema']['properties']['access']['items']['oneOf']
          .map((access) => access.properties.type.enum[0])
          .sort()
      ).toEqual(['incoming-payment', 'outgoing-payment', 'quote'].sort())
    })
  })
})
