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
  ScrollRestoration,
  useLocation
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { cx } from 'class-variance-authority'
import { PublicEnv, type PublicEnvironment } from './PublicEnv'
import { getOpenPaymentsUrl } from './lib/utils'
import { messageStorage, type Message } from './lib/message.server'
import { TopMenu } from './components/TopMenu'
import { Snackbar } from './components/Snackbar'
import tailwind from './styles/tailwind.css'
import logo from '../public/logo.svg'
import background from '../public/background.png' // Ensure this path is correct

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
  const location = useLocation()

  const showTopMenu =
    location?.pathname?.indexOf('mock-idp') === -1 ? true : false

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
      <body
        className='h-full text-tealish bg-cover bg-no-repeat bg-center bg-fixed'
        style={{ backgroundImage: `url(${background})` }}
      >
        <div className='min-h-full'>
          {showTopMenu && <TopMenu />}
          <div
            className={cx(
              `pt-20 md:pt-0 flex flex-1 flex-col`,
              showTopMenu && 'pt-16'
            )}
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

export function links() {
  return [
    { rel: 'stylesheet', href: tailwind },
    { rel: 'icon', href: logo }
  ]
}
