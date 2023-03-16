import { createOpenAPI } from 'openapi'
import path from 'path'

export async function getResourceServerOpenApi() {
  return createOpenAPI(path.resolve(__dirname, './resource-server.yaml'))
}

export async function getAuthServerOpenApi() {
  return createOpenAPI(path.resolve(__dirname, './auth-server.yaml'))
}
