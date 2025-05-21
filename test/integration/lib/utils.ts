import { validate, version } from 'uuid'

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function poll<T>(
  fn: () => Promise<T>,
  successCondition: (responseData: T) => boolean,
  pollDurationSeconds: number,
  pollIntervalSeconds: number
): Promise<T> {
  const startTime = Date.now()
  let responseData

  while (Date.now() - startTime < pollDurationSeconds * 1000) {
    try {
      responseData = await fn()

      if (successCondition(responseData)) {
        return responseData
      }
    } catch (error) {
      console.error('Error during polling:', error)
    }

    await wait(pollIntervalSeconds * 1000)
  }

  throw new Error('Poll completed without success')
}

export async function pollCondition(
  successCondition: () => boolean,
  pollDurationSeconds: number,
  pollIntervalSeconds: number
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < pollDurationSeconds * 1000) {
    try {
      if (successCondition()) {
        return
      }
    } catch (error) {
      console.error('Error during polling:', error)
    }

    await wait(pollIntervalSeconds * 1000)
  }

  throw new Error('Poll completed without success')
}

export function parseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((header) => {
      const parts = header.split(';')
      const cookiePart = parts[0]
      return cookiePart
    })
    .join(';')
}

/**
 * Omit distributed to all types in a union.
 * @example
 * type WithoutA = UnionOmit<{ a: number; c: number } | { b: number }, 'a'> // { c: number } | { b: number }
 * const withoutAOK: WithoutA = { c: 1 } // OK
 * const withoutAOK2: WithoutA = { b: 1 } // OK
 * const withoutAError: WithoutA = { a: 1, c: 1 } // Error
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never

/**
 * @param url remove the tenant id from the {url}
 */
export function urlWithoutTenantId(url: string): string {
  if (url.length > 36 && validateId(url.slice(-36))) return url.slice(0, -37)
  return url
}

function validateId(id: string): boolean {
  return validate(id) && version(id) === 4
}
