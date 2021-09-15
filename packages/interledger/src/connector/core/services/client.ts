import { AxiosInstance } from 'axios'
import { Errors } from 'ilp-packet'
import { RafikiAccount } from '../rafiki'

export async function sendToPeer(
  client: AxiosInstance,
  account: RafikiAccount,
  prepare: Buffer
): Promise<Buffer> {
  const { http } = account
  if (!http) {
    throw new Errors.UnreachableError('no outgoing endpoint')
  }
  const res = await client.post<Buffer>(http.outgoing.endpoint, prepare, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${http.outgoing.authToken}` }
  })
  return res.data
}
