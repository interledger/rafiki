import type { V2_MetaFunction } from '@remix-run/node'
import { json, type LoaderArgs } from '@remix-run/node'
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

export const meta: V2_MetaFunction = () => [
  { title: 'Rafiki Admin' },
  { charset: 'utf-8' },
  { viewport: 'width=device-width,initial-scale=1' }
]

export const loader = async ({ request }: LoaderArgs) => {
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const message = session.get('message') as Message

  const publicEnv: PublicEnvironment = {
    OPEN_PAYMENTS_URL: getOpenPaymentsUrl()
  }

  if (!message) {
    return json({ message: null, publicEnv })
  }

  return json(
    { message, publicEnv },
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
  const { message, publicEnv } = useLoaderData<typeof loader>()
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
          <Sidebar />
          <div className='pt-20 md:pt-0 flex md:pl-60 flex-1 flex-col'>
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
            <Sidebar />
            <div className='flex pt-20 md:pt-0 md:pl-60 flex-1 flex-col'>
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
    errorMessage = error.message
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
