import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

interface Rates {
  [currency: string]: { [currency: string]: number }
}

const exchangeRates: Rates = {
  USD: {
    EUR: 0.89,
    ZAR: 18.7
  },
  EUR: {
    USD: 1.12,
    ZAR: 20.48
  },
  ZAR: {
    USD: 0.053,
    EUR: 0.049
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loader({ request }: LoaderArgs) {
  const base = new URL(request.url).searchParams.get('base') || 'USD'

  return json(
    {
      base,
      rates: exchangeRates[base] ?? {}
    },
    { status: 200 }
  )
}
