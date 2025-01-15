import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import type { ActionFunction, TypedResponse } from '@remix-run/node'
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ApiCredentialsForm } from '~/components/ApiCredentialsForm'
import { commitSession, getSession, SESSION_NAME } from '~/lib/session.server'

interface LoaderData {
  hasCredentials: boolean
}

export const loader = async ({
  request
}: LoaderFunctionArgs): Promise<TypedResponse<LoaderData>> => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const session = await getSession(cookies)
  const hasCredentials = !!session.get('tenantId') && !!session.get('apiSecret')

  return json({ hasCredentials })
}

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
        return redirect('/', {
          headers: {
            'Set-Cookie':
              // Effectively deletes the cookie (server will delete because of past expirey)
              `${SESSION_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
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

export default function Index() {
  const { hasCredentials } = useLoaderData<LoaderData>()
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-7rem)] md:min-h-[calc(100vh-3rem)]'>
        <div className='p-4 space-y-6 md:p-10 md:space-y-16'>
          <h1 className='text-6xl pt-10 md:text-9xl md:pt-16 text-[#F37F64]'>
            Welcome!
          </h1>
          <div className='space-y-8'>
            <p className='text-4xl md:text-7xl'>Rafiki Admin</p>
            <p>This is Rafiki&apos;s administrative user interface.</p>
          </div>
          <p>
            In this web application, you&apos;ll be able to manage peering
            relationships, assets, and wallet addresses, among other settings.
          </p>

          <div className='space-y-4'>
            <p className='text-gray-600'>
              To get started, please configure your API credentials
            </p>
            <div className='max-w-md mx-auto'>
              <ApiCredentialsForm hasCredentials={hasCredentials} />
            </div>
          </div>

          <p>
            <a href='https://rafiki.dev' className='font-semibold'>
              https://rafiki.dev
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
