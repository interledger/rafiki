import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { useState } from 'react'
import { ApiSecretDialog } from '~/components/ApiSecretDialog'
import { Button } from '~/components/ui'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  return null
}

export default function Index() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(
        sessionStorage.getItem('tenantId') &&
        sessionStorage.getItem('apiSecret')
      )
    }
    return false
  })

  const handleOpenDialog = () => setIsDialogOpen(true)
  const handleCloseDialog = (success?: boolean) => {
    setIsDialogOpen(false)
    if (success) {
      setHasCredentials(true)
    }
  }

  const handleClearCredentials = () => {
    sessionStorage.removeItem('tenantId')
    sessionStorage.removeItem('apiSecret')
    setHasCredentials(false)
  }

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

          {/* 
              TODO: is this the best place for the credential prompt?
              Should it be similar to kratos login where it checks on every page and prompts?
              How does it work in conjunction with kratos login prompt when it is enabled? How should it work in that case?
              How to handle uncredentialed requests? block tabs in UI if not set? before sending any request ensure credentials
              are set else redirect to page to set?
                - perhaps a good enough initial prompt with a redirect is better than trying to make a bullet proof initial prompt.
          */}
          <div className='space-y-4'>
            {hasCredentials ? (
              <div className='space-y-4'>
                <p className='text-green-600'>✓ API credentials configured</p>
                <Button
                  type='submit'
                  intent='danger'
                  aria-label='clear API credentials'
                  onClick={handleClearCredentials}
                >
                  Clear API Credentials
                </Button>
              </div>
            ) : (
              <div className='space-y-4'>
                <p className='text-gray-600'>
                  To get started, please configure your API credentials
                </p>
                <Button
                  type='submit'
                  aria-label='set API credentials'
                  onClick={handleOpenDialog}
                >
                  Set API Credentials
                </Button>
              </div>
            )}
          </div>

          <p>
            <a href='https://rafiki.dev' className='font-semibold'>
              https://rafiki.dev
            </a>
          </p>
        </div>
      </div>

      {isDialogOpen && (
        <ApiSecretDialog
          title='Enter API Credentials'
          onClose={handleCloseDialog}
        />
      )}
    </div>
  )
}
