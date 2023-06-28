import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

interface Rates {
  [currency: string]: { [currency: string]: number }
}

const exchangeRates: Rates = {
  USD: {
    EUR: 1.1602,
    ZAR: 17.3792
  },
  EUR: {
    USD: 0.8619,
    ZAR: 20.44
  },
  ZAR: {
    USD: 0.0575,
    EUR: 0.0489
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
