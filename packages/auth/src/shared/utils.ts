import * as crypto from 'crypto'
import { v4 } from 'uuid'
import { AppContext } from '../app'

export function generateNonce(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}

export function generateToken(): string {
  return crypto.randomBytes(10).toString('hex').toUpperCase()
}

export function generateRouteLogs(ctx: AppContext): {
  requestId: string
  route: typeof ctx.path
  method: typeof ctx.method
  params: typeof ctx.params
  headers: typeof ctx.headers
  requestBody: typeof ctx.request.body
} {
  return {
    requestId: v4(),
    method: ctx.method,
    route: ctx.path,
    headers: ctx.headers,
    params: ctx.params,
    requestBody: ctx.request.body
  }
}
