export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function poll<T>(
  requestFn: () => Promise<T>,
  successCondition: (responseData: T) => boolean,
  pollingDurationSeconds: number,
  pollingIntervalSeconds: number
): Promise<T> {
  const startTime = Date.now()
  let responseData

  while (Date.now() - startTime < pollingDurationSeconds * 1000) {
    try {
      responseData = await requestFn()

      if (successCondition(responseData)) {
        console.log({ responseData })
        return responseData
      }
    } catch (error) {
      console.error('Error during polling:', error)
    }

    await new Promise((resolve) =>
      setTimeout(resolve, pollingIntervalSeconds * 1000)
    )
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
