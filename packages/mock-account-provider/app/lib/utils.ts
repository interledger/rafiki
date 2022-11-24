import { createPublicKey } from 'crypto'
import { parse } from 'querystring'

createPublicKey('')

export function parseQueryString(query: string) {
  const dictionary = parse(query)
  const pairs = Object.keys(dictionary).map((k) => {
    return [k.toLowerCase().replace(/^\?/, ''), dictionary[k] ?? '']
  })

  return {
    get: (key: string): string | Array<string> | undefined => {
      return (pairs.find((p) => p[0] === key.toLowerCase()) || ['', ''])[1]
    },
    getAsArray: (key: string): Array<string> | undefined => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value
      } else {
        return [value]
      }
    },
    getAsString: (key: string): string | undefined => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value[value.length - 1]
      } else {
        return value
      }
    },
    has: (...keys: Array<string>) => {
      return keys.every((k) => pairs.some((p) => p[0] === k.toLowerCase()))
    }
  }
}
