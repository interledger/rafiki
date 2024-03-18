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
