import * as crypto from 'crypto'
import { AppContext } from '../app'

export function generateNonce(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}

export function generateToken(): string {
  return crypto.randomBytes(10).toString('hex').toUpperCase()
}

export function generateRouteLogs(ctx: AppContext): {
  route: typeof ctx.path
  method: typeof ctx.method
  params: typeof ctx.params
  headers: typeof ctx.headers
  requestBody: typeof ctx.request.body
} {
  return {
    method: ctx.method,
    route: ctx.path,
    headers: ctx.headers,
    params: ctx.params,
    requestBody: ctx.request.body
  }
}

// Intended for Date strings like "2024-12-05T15:10:09.545Z" (e.g., from new Date().toISOString())
export function isValidDateString(date: string): boolean {
  return !isNaN(Date.parse(date))
}
