// This is a dummy page
// TODO: Integrate with Ory Kratos
import { redirect, type LoaderArgs, type ActionArgs } from '@remix-run/node'
// import { z } from 'zod'
import axios from 'axios'
import {
  getLoginChallenge,
  setChallengeAndRedirect,
  authStorage
} from '../lib/auth.server'

export default function Login() {
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Login to Rafiki Admin</h3>
          <div className='space-y-8'>
            <form method='post' action='/login'>
              <input
                type='text'
                name='username'
                placeholder='Username'
                required
              />
              <input
                type='password'
                name='password'
                placeholder='Password'
                required
              />
              <button type='submit'>Log In</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const urlLoginChallenge = url.searchParams.get('login_challenge')
  // TODO: Add safe parse
  // const result = z.string().uuid().safeParse(urlLoginChallenge)
  // if (!result.success) {
  //     throw json(null, { status: 400, statusText: 'Login challenge is required.' })
  // }
  const session = await authStorage.getSession(request.headers.get('cookie'))
  const sessionLoginChallenge = getLoginChallenge(session)

  if (urlLoginChallenge && !sessionLoginChallenge) {
    console.log('setting cookie')
    return setChallengeAndRedirect({
      session,
      location: '.',
      challengeName: 'login_challenge',
      challenge: urlLoginChallenge
    })
  } else if (sessionLoginChallenge) {
    console.log('getting login challenge')
    const hydraUrl = `http://hydra:4445/admin/oauth2/auth/requests/login?login_challenge=${sessionLoginChallenge}`
    console.log('HydraUrl: ', hydraUrl)
    try {
      const response = await axios.get(hydraUrl)
      console.log('got a response')
      if (response.status !== 200) {
        throw new Error(
          `Hydra responded with status: ${response.status}: ${response.statusText}`
        )
      }
      return response.data
    } catch (error) {
      console.error('There was an error in the request:', error)
      throw error
    }
  }
  return {}
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData()
  const username = formData.get('username')
  const password = formData.get('password')
  const session = await authStorage.getSession(request.headers.get('cookie'))

  const loginChallenge = getLoginChallenge(session)

  if (!loginChallenge) {
    throw new Error('Login challenge empty')
  }

  const response = await axios.put(
<<<<<<< HEAD
    `http://hydra:4445/oauth2/auth/requests/login/accept?login_challenge=${loginChallenge}`,
=======
    `http://hydra:4445/admin/oauth2/auth/requests/login/accept?login_challenge=${loginChallenge}`,
>>>>>>> 5addf52d (feat(frontend, backend): graphql api security with hydra)
    {
      subject: username
      // other data Hydra needs
    }
  )

  return redirect(response.data.redirect_to)
}
