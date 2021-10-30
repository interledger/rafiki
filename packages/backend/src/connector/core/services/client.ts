import { AxiosInstance } from 'axios'

export interface OutgoingHttp {
  authToken: string
  endpoint: string
}

export async function sendToPeer(
  client: AxiosInstance,
  outgoing: OutgoingHttp,
  prepare: Buffer
): Promise<Buffer> {
  const res = await client.post<Buffer>(outgoing.endpoint, prepare, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${outgoing.authToken}` }
  })
  return res.data
}
