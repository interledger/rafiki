export function formatAmount(amount: string, scale: number) {
  const value = BigInt(amount)
  const divisor = BigInt(10 ** scale)

  const integerPart = (value / divisor).toString()
  const fractionalPart = (value % divisor).toString().padStart(scale, '0')

  return `${integerPart}.${fractionalPart}`
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const parseBool = (str: string) => {
  return ['true', 't', '1'].includes(str.toLowerCase())
}

export function getOpenPaymentsUrl() {
  const env = typeof window === 'undefined' ? process.env : window.ENV

  if (!env?.OPEN_PAYMENTS_URL) {
    throw new Error('Environment variable OPEN_PAYMENTS_URL is missing')
  }

  return env.OPEN_PAYMENTS_URL
}
