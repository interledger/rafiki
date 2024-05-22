import {
  json,
  type LoaderFunctionArgs,
  type MetaFunction
} from '@remix-run/node'
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  useLoaderData,
  ScrollRestoration
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { PublicEnv, type PublicEnvironment } from './PublicEnv'
import { getOpenPaymentsUrl } from './lib/utils'
import { messageStorage, type Message } from './lib/message.server'
import { Sidebar } from './components/Sidebar'
import { Snackbar } from './components/Snackbar'
import tailwind from './styles/tailwind.css'
import logo from '../public/logo.svg'

export const meta: MetaFunction = () => [
  { charset: 'utf-8' },
  { title: 'Mock Account Servicing Entity' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' }
]

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const publicEnv: PublicEnvironment = {
    OPEN_PAYMENTS_URL: getOpenPaymentsUrl()
  }

  const cookies = request.headers.get('cookie')
  const session = await messageStorage.getSession(cookies)
  const message = session.get('message') as Message

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
    <html lang='en' className='h-full'>
      <head>
        <Meta />
        <Links />
      </head>
      <body className='h-full text-tealish bg-blue-100'>
        <div className='min-h-full'>
          <Sidebar />
          <div className={`pt-20 md:pt-0 md:pl-60 flex flex-1 flex-col`}>
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

export function links() {
  return [
    { rel: 'stylesheet', href: tailwind },
    { rel: 'icon', href: logo }
  ]
}
