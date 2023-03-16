import { createOpenAPI, OpenAPI } from 'openapi'
import path from 'path'

export async function getResourceServerOpenApi(): Promise<OpenAPI> {
  return createOpenAPI(path.resolve(__dirname, './resource-server.yaml'))
}

export async function getAuthServerOpenApi(): Promise<OpenAPI> {
  return createOpenAPI(path.resolve(__dirname, './auth-server.yaml'))
}
