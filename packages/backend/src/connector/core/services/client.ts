import { AxiosInstance } from 'axios'

export interface OutgoingHttp {
  authToken: string
  endpoint: string
}

export async function sendToPeer(
  client: AxiosInstance,
  outgoingHttp: OutgoingHttp,
  prepare: Buffer
): Promise<Buffer> {
  const res = await client.post<Buffer>(outgoingHttp.endpoint, prepare, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${outgoingHttp.authToken}` }
  })
  return res.data
}
