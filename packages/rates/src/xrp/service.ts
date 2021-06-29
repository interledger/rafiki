import Axios, { AxiosInstance } from 'axios'

export const CHARTS_API =
  'https://data.ripple.com/v2/exchange_rates/EUR+rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq/XRP'

export interface XRPService {
  fetchPrice(): Promise<number>
}

export function createXRPService(): XRPService {
  const axios = Axios.create({ timeout: 10_000 })

  return {
    fetchPrice: () => fetchPrice(axios)
  }
}

async function fetchPrice(axios: AxiosInstance): Promise<number> {
  const res = await axios.get(CHARTS_API)
  if (res.data.result !== 'success') {
    throw new Error('unabled to get rate')
  }
  const { rate } = res.data
  return 1 / +rate
}
