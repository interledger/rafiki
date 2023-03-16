import { createOpenAPI, OpenAPI } from 'openapi'
import path from 'path'

export async function getTokenIntrospectionOpenApi(): Promise<OpenAPI> {
  return createOpenAPI(path.resolve(__dirname, './token-introspection.yaml'))
}
