import Axios, { AxiosInstance } from 'axios'
import { parseResponse, ratesToPrices } from './util'

type PriceMap = Record<string, number>

export const RATES_API =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

export interface ECBService {
  fetchPrices(): Promise<PriceMap>
}

export function createECBService(): ECBService {
  const axios = Axios.create({
    responseType: 'text',
    timeout: 10_000
  })

  return {
    fetchPrices: () => fetchPrices(axios)
  }
}

async function fetchPrices(axios: AxiosInstance): Promise<PriceMap> {
  const { data } = await axios.get(RATES_API)
  return ratesToPrices(await parseResponse(data))
}
