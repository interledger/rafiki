import * as sax from 'sax'

interface ECBSaxNode {
  name: string
  attributes: {
    currency?: string
    rate?: number
  }
}

interface ECBAPIData {
  base: string
  rates: {
    [key: string]: number
  }
}

export function parseResponse(data: string): Promise<ECBAPIData> {
  const parser = sax.parser(true, {})
  const apiData: ECBAPIData = { base: 'EUR', rates: {} }
  parser.onopentag = (node: ECBSaxNode) => {
    if (
      node.name === 'Cube' &&
      node.attributes.currency &&
      node.attributes.rate
    ) {
      apiData.rates[node.attributes.currency] = +node.attributes.rate
    }
  }
  return new Promise((resolve, reject) => {
    parser.onerror = reject
    parser.onend = () => resolve(apiData)
    parser.write(data).close()
  })
}

export function ratesToPrices(ecbData: ECBAPIData): Record<string, number> {
  const prices = { [ecbData.base]: 1.0 }
  for (const currency in ecbData.rates) {
    const rate = ecbData.rates[currency]
    prices[currency] = 1.0 / rate
  }
  return prices
}
