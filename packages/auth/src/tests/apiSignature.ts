import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'

export function generateApiSignature(
  secret: string,
  version: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): string {
  const timestamp = Math.round(new Date().getTime() / 1000)
  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}
