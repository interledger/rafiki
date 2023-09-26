import { AxiosInstance } from 'axios'
import { Errors } from 'ilp-packet'
import { CONTENT_TYPE } from '../middleware/ilp-packet'
import { OutgoingAccount } from '../rafiki'

export async function sendToPeer(
  client: AxiosInstance,
  account: OutgoingAccount,
  prepare: Buffer
): Promise<Buffer> {
  const { http } = account
  if (!http) {
    throw new Errors.UnreachableError('no outgoing endpoint')
  }
  const res = await client.post<Buffer>(http.outgoing.endpoint, prepare, {
    responseType: 'arraybuffer',
    headers: {
      Authorization: `Bearer ${http.outgoing.authToken}`,
      'Content-Type': CONTENT_TYPE
    }
  })
  return res.data
}
