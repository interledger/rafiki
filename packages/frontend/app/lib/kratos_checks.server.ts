import { redirect } from '@remix-run/node'
import axios from 'axios'
import variables from './envConfig.server'

export async function isLoggedIn(
  cookieHeader?: string | null
): Promise<boolean> {
  if (!variables.authEnabled) {
    return false
  }
  try {
    const session = await axios.get(
      `${variables.kratosContainerPublicUrl}/sessions/whoami`,
      {
        headers: {
          cookie: cookieHeader
        },
        withCredentials: true
      }
    )

    const isLoggedIn = session.status === 200 && session.data?.active

    return isLoggedIn
  } catch {
    return false
  }
}

export async function checkAuthAndRedirect(
  url: string,
  cookieHeader?: string | null
) {
  const { pathname } = new URL(url)
  const isAuthPath = pathname.startsWith('/auth')
  const isSettingsPage = pathname.includes('/settings')
  const isLogoutPage = pathname.includes('logout')

  if (!variables.authEnabled) {
    // If auth is disabled users shouldn't accesses the auth path or Kratos settings pages
    if (isAuthPath || isSettingsPage) {
      throw redirect('/')
    } else {
      return
    }
  }

  const loggedIn = await isLoggedIn(cookieHeader)

  // Logged-in users can access all pages except auth pages, with the exception of the manual logout page
  if (loggedIn) {
    if (isAuthPath && !isLogoutPage) {
      throw redirect('/')
    }
    return
  } else {
    // Users who are not logged in can only access auth path pages and cannot logout
    if (!isAuthPath || isLogoutPage) {
      throw redirect('/auth')
    }
    return
  }
}
