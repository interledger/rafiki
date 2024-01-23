import { PassThrough } from 'stream'
import type { EntryContext } from '@remix-run/node'
import { createReadableStreamFromReadable } from '@remix-run/node'
import { RemixServer } from '@remix-run/react'
import { renderToPipeableStream } from 'react-dom/server'
import { runSeed } from './lib/run_seed.server'

declare global {
  // eslint-disable-next-line no-var
  var __seeded: boolean | undefined
}

// Used for running seeds in a try loop with exponential backoff
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
async function callWithRetry(fn: () => any, depth = 0): Promise<void> {
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))

  try {
    return await fn()
  } catch (e) {
    if (depth > 7) {
      throw e
    }
    await wait(2 ** depth * 30)
    return callWithRetry(fn, depth + 1)
  }
}

if (!global.__seeded) {
  callWithRetry(runSeed)
    .then(() => {
      global.__seeded = true
    })
    .catch((e) => {
      console.log(
        `seeding failed with ${e}. If seeding has already completed this can probably be ignored`
      )
    })
}

const ABORT_DELAY = 5000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady: () => {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          )

          pipe(body)
        },
        onShellError: (err) => {
          reject(err)
        },
        onError: (error) => {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if(shellRendered) {
            console.error(error)
          }
        }
      }
    )

    setTimeout(abort, ABORT_DELAY)
  })
}
