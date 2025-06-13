import type { TypedResponse } from '@remix-run/node'
import { json, redirect, type ActionFunction } from '@remix-run/node'
import { getSession, commitSession, destroySession } from '~/lib/session.server'

interface ActionErrorResponse {
  status: number
  statusText: string
}

export const action: ActionFunction = async ({
  request
}): Promise<Response | TypedResponse<ActionErrorResponse>> => {
  try {
    const formData = await request.formData()
    const intent = formData.get('intent')

    switch (intent) {
      case 'clear': {
        const session = await getSession(request.headers.get('cookie'))

        return redirect('/', {
          headers: {
            'Set-Cookie': await destroySession(session, {
              maxAge: -1
            })
          }
        })
      }
      case 'save': {
        const tenantId = formData.get('tenantId') as string
        const apiSecret = formData.get('apiSecret') as string

        if (!tenantId || !apiSecret) {
          return json<ActionErrorResponse>({
            status: 400,
            statusText: 'Missing tenantId or apiSecret'
          })
        }

        const session = await getSession(request.headers.get('Cookie'))
        session.set('tenantId', tenantId)
        session.set('apiSecret', apiSecret)

        return redirect('/', {
          headers: { 'Set-Cookie': await commitSession(session) }
        })
      }
      default:
        throw new Error(`Invalid intent: ${intent}`)
    }
  } catch (error) {
    console.error('Error in action:', error)
    return json<ActionErrorResponse>({
      status: 500,
      statusText: 'An unexpected error occurred.'
    })
  }
}
