import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import type { TypedResponse } from '@remix-run/node'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { Card, Heading, Text } from '@radix-ui/themes'
import { ApiCredentialsForm } from '~/components/ApiCredentialsForm'
import { getSession } from '~/lib/session.server'
import bgUrl from '~/assets/bg.webp'

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
    <div className='relative min-h-screen overflow-hidden'>
      <div
        className='absolute inset-0 bg-cover bg-center'
        style={{ backgroundImage: `url(${bgUrl})` }}
      />
      <div className='absolute inset-0 bg-white/30' />
      <div className='relative flex min-h-screen items-center justify-center px-6 py-10'>
        <Card className='w-full max-w-xl border border-pearl/80 bg-white/90 shadow-xl'>
          <div className='space-y-6 text-center'>
            <Text
              size='2'
              weight='medium'
              className='tracking-[0.35em] text-gray-500 uppercase'
            >
              Welcome
            </Text>
            <Heading size='8' className='text-[#F37F64] mb-4'>
              Rafiki Admin
            </Heading>
            <Text as='p' size='3' color='gray' className='mt-6'>
              Configure your API credentials to start managing tenants, assets,
              and wallet addresses.
            </Text>
            <div className='pt-2'>
              <ApiCredentialsForm
                showClearCredentials={
                  hasCredentials && !defaultTenantId && !defaultApiSecret
                }
                defaultTenantId={defaultTenantId}
                defaultApiSecret={defaultApiSecret}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
