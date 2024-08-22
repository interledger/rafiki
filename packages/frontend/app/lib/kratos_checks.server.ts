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
  const isAuthPath = new URL(url).pathname.startsWith('/auth')
  const isSettingsPage = new URL(url).pathname.includes('/settings')
  const isLogoutPage = new URL(url).pathname.includes('/logout')

  if (isAuthPath) {
    if (!variables.authEnabled) {
      throw redirect('/')
    } else {
      const loggedIn = await isLoggedIn(cookieHeader)
      if (loggedIn) {
        if(isLogoutPage) {
          return
        }
        throw redirect('/')
      }
      return
    }
  } else {
    if (!variables.authEnabled) {
      if (isSettingsPage) {
        throw redirect('/')
      }
      return
    } else {
      const loggedIn = await isLoggedIn(cookieHeader)
      if (!loggedIn) {
        throw redirect('/auth')
      }
      return
    }
  }
}
