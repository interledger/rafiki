import { redirect } from '@remix-run/node'
import axios from 'axios'
import variables from '../utils/envConfig.server'

export async function isLoggedIn(
  cookieHeader?: string | null
): Promise<boolean> {
  let isLoggedIn = false

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

    isLoggedIn = session.status === 200 && session.data?.active

    return isLoggedIn
  } catch {
    // TODO: error handling
    return false
  }
}

export async function redirectIfUnauthorizedAccess(
  url: string,
  cookieHeader?: string | null
) {
  const isAuthPath = new URL(url).pathname.startsWith('/auth')

  if (!isAuthPath) {
    const loggedIn = await isLoggedIn(cookieHeader)
    if (!loggedIn) {
      throw redirect('/auth')
    }
  }
  return
}

export async function redirectIfAlreadyAuthorized(
  url: string,
  cookieHeader?: string | null
) {
  const isAuthPath = new URL(url).pathname.startsWith('/auth')

  if (isAuthPath) {
    const loggedIn = await isLoggedIn(cookieHeader)
    if (loggedIn) {
      throw redirect('/')
    }
  }
  return
}
