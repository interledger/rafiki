import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import type { TypedResponse } from '@remix-run/node'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ApiCredentialsForm } from '~/components/ApiCredentialsForm'
import { getSession } from '~/lib/session.server'

interface LoaderData {
  hasCredentials: boolean
}

interface LoaderData {
  hasCredentials: boolean
  defaultTenantId: string
  defaultApiSecret: string
}

export const loader = async ({
  request
}: LoaderFunctionArgs): Promise<TypedResponse<LoaderData>> => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const session = await getSession(cookies)
  const hasCredentials = !!session.get('tenantId') && !!session.get('apiSecret')

  const url = new URL(request.url)
  const defaultTenantId = url.searchParams.get('tenantId') ?? ''
  const defaultApiSecret = url.searchParams.get('apiSecret') ?? ''

  return json({ hasCredentials, defaultTenantId, defaultApiSecret })
}

interface LoaderData {
  hasCredentials: boolean
}

export default function Index() {
  const { hasCredentials, defaultTenantId, defaultApiSecret } =
    useLoaderData<LoaderData>()

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
              <ApiCredentialsForm
                showClearCredentials={
                  hasCredentials && !defaultTenantId && !defaultApiSecret
                }
                defaultTenantId={defaultTenantId}
                defaultApiSecret={defaultApiSecret}
              />
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
