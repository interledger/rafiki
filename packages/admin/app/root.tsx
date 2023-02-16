import { json, type LoaderArgs, type MetaFunction } from '@remix-run/node'
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
  useLoaderData
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import favicon from '../public/favicon.svg'
import { Sidebar } from './components/Sidebar'
import { Snackbar } from './components/Snackbar'
import { commitSession, getSession, type Message } from './lib/message.server'
import tailwind from './styles/main.css'

export const meta: MetaFunction = () => ({
  charset: 'utf-8',
  title: 'Rafiki Admin',
  viewport: 'width=device-width,initial-scale=1'
})

export const loader = async ({ request }: LoaderArgs) => {
  const session = await getSession(request.headers.get('cookie'))

  const message = session.get('message') as Message

  if (!message) {
    return json({ message: null })
  }

  if (!message.type) {
    throw new Error('Message should have a type')
  }

  return json(
    { message },
    {
      headers: { 'Set-Cookie': await commitSession(session) }
    }
  )
}

export default function App() {
  const { message } = useLoaderData<typeof loader>()
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
      <body className='h-full  text-tealish'>
        <div className='min-h-full'>
          <Sidebar />
          <div className='flex md:pl-60 flex-1 flex-col'>
            <main className='pb-8 px-4'>
              <Outlet />
            </main>
          </div>
        </div>

        {}
        <Snackbar
          id='snackbar'
          //@ts-expect-error test
          onClose={setSnackbarOpen}
          show={snackbarOpen}
          message={message}
          dismissAfter={2000}
        />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  )
}

// TODO: add styles to ErrorBoundary
export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <html lang='en'>
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <div className='admin-panel'>
          <div className='admin-panel-background'>
            <header className='admin-menu'>
              <h1>Rafiki Admin</h1>
            </header>
            <div className='admin-panel-inside'>
              <main>
                {JSON.stringify(error)}
                <h1>An error ocurred</h1>
                <p>{error.message}</p>
              </main>
            </div>
          </div>
        </div>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  )
}

// TODO: add styles to CatchBoundary
export function CatchBoundary() {
  const caughtResponse = useCatch()

  return (
    <html lang='en'>
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <div className='admin-panel'>
          <div className='admin-panel-background'>
            <header className='admin-menu'>
              <h1>Rafiki Admin</h1>
            </header>
            <div className='admin-panel-inside'>
              <main>
                {caughtResponse.statusText && (
                  <h1>{caughtResponse.statusText}</h1>
                )}
                {(caughtResponse.data && (
                  <pre>
                    <code>{JSON.stringify(caughtResponse.data, null, 2)}</code>
                  </pre>
                )) || <p>{'Something went wrong.'}</p>}
              </main>
            </div>
          </div>
        </div>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  )
}

export function links() {
  return [
    { rel: 'stylesheet', href: tailwind },
    { rel: 'icon', href: favicon }
  ]
}
