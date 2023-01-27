import type { MetaFunction } from '@remix-run/node'
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch
} from '@remix-run/react'

import styles from './styles/dist/main.css'
import favicon from '../public/favicon.svg'
import MainNavigation from 'app/components/MainNavigation'

export const meta: MetaFunction = () => ({
  charset: 'utf-8',
  title: 'Rafiki Admin',
  viewport: 'width=device-width,initial-scale=1'
})

export default function App() {
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
              <MainNavigation />
            </header>
            <div className='admin-panel-inside'>
              <Outlet />
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
              <MainNavigation />
            </header>
            <div className='admin-panel-inside'>
              <main>
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
              <MainNavigation />
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
  return [{ rel: 'stylesheet', href: styles }, {rel: 'icon', href: favicon}]
}
