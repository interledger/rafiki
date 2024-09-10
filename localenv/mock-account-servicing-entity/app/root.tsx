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
  useLocation,
  Link
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { cx } from 'class-variance-authority'
import { PublicEnv, type PublicEnvironment } from './PublicEnv'
import { getOpenPaymentsUrl } from './lib/utils'
import { InstanceConfig } from './lib/types'
import { messageStorage, type Message } from './lib/message.server'
import { TopMenu } from './components/TopMenu'
import { Snackbar } from './components/Snackbar'
import tailwind from './styles/tailwind.css'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const publicEnv: PublicEnvironment = {
    OPEN_PAYMENTS_URL: getOpenPaymentsUrl()
  }

  const instanceConfig: InstanceConfig = {
    name: process?.env?.DISPLAY_NAME ?? '',
    logo: process?.env?.DISPLAY_ICON ?? 'logo.svg',
    background:
      process?.env?.HOSTNAME == 'cloud-nine-wallet' ? 'bg-wallet' : 'bg-bank'
  }

  const cookies = request.headers.get('cookie')
  const session = await messageStorage.getSession(cookies)
  const message = session.get('message') as Message

  if (!message) {
    return json({ message: null, publicEnv, instanceConfig })
  }

  return json(
    { message, publicEnv, instanceConfig },
    {
      headers: {
        'Set-Cookie': await messageStorage.destroySession(session, {
          maxAge: -1
        })
      }
    }
  )
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { charset: 'utf-8' },
    { title: `${data?.instanceConfig.name} - Mock Account Servicing Entity` },
    { name: 'viewport', content: 'width=device-width,initial-scale=1' },
    {
      tagName: 'link',
      rel: 'icon',
      href: `/white-${data?.instanceConfig.logo}`
    }
  ]
}

export default function App() {
  const { message, publicEnv, instanceConfig } = useLoaderData<typeof loader>()
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const location = useLocation()

  const showTopmenu =
    location?.pathname?.indexOf('mock-idp') === -1 ? true : false

  useEffect(() => {
    if (!message) {
      return
    }
    setSnackbarOpen(true)
  }, [message])

  return (
    <html lang='en'>
      <head>
        <Meta />
        <Links />
      </head>
      <body
        className={cx(
          'h-full text-tealish bg-blue-100 bg-cover bg-no-repeat bg-center bg-fixed',
          instanceConfig.background
        )}
      >
        <div className='min-h-full'>
          {showTopmenu && (
            <TopMenu name={instanceConfig.name} logo={instanceConfig.logo} />
          )}
          <div
            className={cx(
              `pt-20 md:pt-0 flex flex-1 flex-col`,
              showTopmenu && 'md:mt-16'
            )}
          >
            <main className='pb-8 px-4'>
              <Outlet context={instanceConfig} />
            </main>
          </div>
          <div className='fixed bottom-0 w-full text-center text-white bg-secondary_blue p-5'>
            This is an example application for an{' '}
            <Link
              className='cursor-pointer font-bold'
              to='https://rafiki.dev/resources/glossary#account-servicing-entity-ase'
            >
              [account servicing entity]
            </Link>
            , used for demonstration & internal development purposes only.
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
  return [{ rel: 'stylesheet', href: tailwind }]
}
