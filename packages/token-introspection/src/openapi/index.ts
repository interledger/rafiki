import { createOpenAPI } from '@interledger/openapi'
import path from 'path'

/**
 * Returns the OpenAPI object for the Token Introspection OpenAPI spec.
 * This object allows validating requests and responses against the spec.
 * See more: https://github.com/interledger/open-payments/blob/main/packages/openapi/README.md
 */
export async function getTokenIntrospectionOpenAPI() {
  return createOpenAPI(
    path.resolve(__dirname, './specs/token-introspection.yaml')
  )
}
