import { redirect, type LoaderArgs, type ActionArgs } from '@remix-run/node'
import { getConsentChallenge, setChallengeAndRedirect, authStorage } from '../lib/auth.server'
import axios from 'axios'

// TODO: Display consent screen or error message
export default function Consent() {
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Do you consent?</h3>
          <div className='space-y-8'>
            <form method="post" action="/consent">
              <input type="checkbox" name="accept" required />
              <button type="submit">Submit</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const urlConsentChallenge = url.searchParams.get('consent_challenge')
  // TODO: Add safe parse
  // const result = z.string().uuid().safeParse(urlConsentChallenge)
  // if (!result.success) {
  //     throw json(null, { status: 400, statusText: 'Consent challenge is required.' })
  // }
  const session = await authStorage.getSession(request.headers.get('cookie'))
  const sessionConsentChallenge = getConsentChallenge(session)

  if (urlConsentChallenge && !sessionConsentChallenge) {
    return setChallengeAndRedirect({ session, location: '.', challengeName: 'consent_challenge', challenge: urlConsentChallenge })
  }

  const HYDRA_ADMIN_URL = 'http://localhost:4445'
  const hydraUrl = `${HYDRA_ADMIN_URL}/oauth2/auth/requests/consent?consent_challenge=${sessionConsentChallenge}`

  try {
    const hydraGetResponse = await axios.get(hydraUrl)
    if (hydraGetResponse.status !== 200) {
      throw new Error(`Hydra responded with status: ${hydraGetResponse.status}: ${hydraGetResponse.statusText}`)
    }
    return hydraGetResponse.data
  } catch (error) {
    throw new Error(`There was an error: ${error}`)
  }
}

// TODO: Submit accept/reject response to consent screen
export const action = async ({ request }: ActionArgs) => {
  const session = await authStorage.getSession(request.headers.get('cookie'))
  const sessionConsentChallenge = getConsentChallenge(session)

  // TODO: skipping for now instead of checking, WIP
  // if (!hydraGetResponse.data.skip) {
  //   return hydraGetResponse.data
  // } else {
  //   await axios.put(`http://localhost:4445/oauth2/auth/requests/consent/accept?consent_challenge=${sessionConsentChallenge}`, {
  //     // other data Hydra needs
  //   })
  // }
  try {
    const hydraPutResponse = await axios.put(`http://localhost:4445/oauth2/auth/requests/consent/accept?consent_challenge=${sessionConsentChallenge}`, {
      // other data Hydra needs
      grant_scope: ['full_access']
    })

    return redirect(hydraPutResponse.data.redirect_to)

  } catch (error) {
    throw new Error(`There was an error: ${error}`)
  }
}
