import type { MetaFunction } from '@remix-run/node'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse
} from '@remix-run/react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import logo from '../public/logo.svg'
import { XCircle } from './components/icons'
import { Sidebar } from './components/Sidebar'
import { Snackbar } from './components/Snackbar'
import { Button } from './components/ui/Button'
import { messageStorage, type Message } from './lib/message.server'
import tailwind from './styles/tailwind.css'
import { getOpenPaymentsUrl } from './shared/utils'
import { PublicEnv, type PublicEnvironment } from './PublicEnv'
import { isLoggedIn, checkAuthAndRedirect } from './lib/kratos_checks.server'
import variables from './lib/envConfig.server'
import axios from 'axios'
import { logger } from './utils/logger.server'
import { getSession } from './lib/session.server'

export const meta: MetaFunction = () => [
  { title: 'Rafiki Admin' },
  { charset: 'utf-8' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' }
]

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  let logoutUrl
  const loggedIn = await isLoggedIn(cookies)
  const displaySidebar = !variables.authEnabled || loggedIn
  const authEnabled = variables.authEnabled
  if (loggedIn) {
    const response = await axios.get(
      `${variables.kratosContainerPublicUrl}/self-service/logout/browser`,
      {
        headers: {
          cookie: cookies
        },
        withCredentials: true
      }
    )
    logoutUrl = response.data.logout_url
    if (!logoutUrl) {
      logoutUrl = '/auth/manual-logout'
      logger.error('Unable to retrieve the logout URL from Kratos')
    }
  }
  const session = await messageStorage.getSession(cookies)
  const message = session.get('message') as Message

  const publicEnv: PublicEnvironment = {
    OPEN_PAYMENTS_URL: getOpenPaymentsUrl()
  }

  const apiCredSession = await getSession(cookies)
  const hasApiCredentials =
    !!apiCredSession.get('tenantId') && !!apiCredSession.get('apiSecret')

  if (!message) {
    return json({
      message: null,
      publicEnv,
      logoutUrl,
      displaySidebar,
      authEnabled,
      hasApiCredentials
    })
  }

  return json(
    {
      message,
      publicEnv,
      logoutUrl,
      displaySidebar,
      authEnabled,
      hasApiCredentials
    },
    {
      headers: {
        'Set-Cookie': await messageStorage.destroySession(session, {
          maxAge: -1
        })
      }
    }
  )
}

export default function App() {
  const {
    message,
    publicEnv,
    logoutUrl,
    displaySidebar,
    authEnabled,
    hasApiCredentials
  } = useLoaderData<typeof loader>()
  const [snackbarOpen, setSnackbarOpen] = useState(false)

  useEffect(() => {
    if (!message) {
      return
    }
    setSnackbarOpen(true)
  }, [message])

  return (
    <html
      lang='en'
      className='h-full bg-polkadot bg-cover bg-no-repeat bg-center bg-fixed'
    >
      <head>
        <Meta />
        <Links />
      </head>
      <body className='h-full text-tealish'>
        <div className='min-h-full'>
          {displaySidebar && (
            <Sidebar
              logoutUrl={logoutUrl}
              authEnabled={authEnabled}
              hasApiCredentials={hasApiCredentials}
            />
          )}
          <div
            className={`pt-20 md:pt-0 flex ${displaySidebar ? 'md:pl-60' : ''} flex-1 flex-col`}
          >
            <main className='pb-8 px-4'>
              <Outlet />
            </main>
          </div>
        </div>
        <Snackbar
          id='snackbar'
          onClose={() => setSnackbarOpen(false)}
          show={snackbarOpen}
          message={message}
          dismissAfter={2000}
        />
        <ScrollRestoration />
        <PublicEnv env={publicEnv} />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()

  const ErrorPage = ({ children }: { children: ReactNode }) => {
    return (
      <html
        lang='en'
        className='h-full bg-polkadot bg-cover bg-no-repeat bg-center bg-fixed'
      >
        <head>
          <Meta />
          <Links />
        </head>
        <body className='h-full text-tealish'>
          <div className='min-h-full'>
            <div className='flex pt-20 md:pt-0 flex-1 flex-col'>
              <main className='grid min-h-screen place-items-center'>
                {children}
              </main>
            </div>
          </div>
          <ScrollRestoration />
          <Scripts />
          <LiveReload />
        </body>
      </html>
    )
  }

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorPage>
        <div className='flex items-center justify-center flex-col bg-offwhite p-10 rounded-md shadow-md space-y-2'>
          <h4 className='font-semibold text-xl -tracking-widest text-[#F37F64]'>
            {error.status}
          </h4>
          <h2 className='text-xl'>{error.statusText}</h2>
          <Button to='/' aria-label='go to homepage'>
            Go to homepage
          </Button>
        </div>
      </ErrorPage>
    )
  }

  let errorMessage = 'Unknown error'
  if (error instanceof Error) {
    errorMessage = error.message.includes('401')
      ? 'Unauthorized. Please set your API credentials.'
      : error.message
  }

  return (
    <ErrorPage>
      <div className='flex items-center justify-center flex-col bg-offwhite p-10 rounded-md shadow-md space-y-5'>
        <div className='grid place-items-center'>
          <XCircle className='w-10 h-10 text-red-500' />
          <p className='text-lg font-semibold'>
            There was an issue with your request.
          </p>
        </div>
        <div>
          <span className='font-light'>Cause:</span> <span>{errorMessage}</span>
        </div>
        <Button to='/' aria-label='go to homepage'>
          Go to homepage
        </Button>
      </div>
    </ErrorPage>
  )
}

export function links() {
  return [
    { rel: 'stylesheet', href: tailwind },
    { rel: 'icon', href: logo }
  ]
}
