// https://www.ory.sh/docs/oauth2-oidc/custom-login-consent/flow#skipping-consent-screen
// https://www.ory.sh/docs/oauth2-oidc/skip-consent
// TODO: What should happen if a user ends up here and has an active session?
import { redirect, json, type LoaderFunctionArgs } from '@remix-run/node'
import axios from 'axios'
import variables from '../utils/envConfig.server'
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const consentChallenge = url.searchParams.get('consent_challenge')
  let redirectTo
  const consentRequestResponse = await axios.get(
    `${variables.hydraClientAdminUrl}/oauth2/auth/requests/consent?consent_challenge=${consentChallenge}`
  )
  if (consentRequestResponse.status !== 200) {
    throw json(null, {
      status: consentRequestResponse.status,
      statusText: consentRequestResponse.statusText
    })
  }

  if (consentRequestResponse.data?.client?.skip_consent) {
    const consentAcceptResponse = await axios.put(
      `${variables.hydraClientAdminUrl}/oauth2/auth/requests/consent/accept?consent_challenge=${consentChallenge}`,
      {
        grant_scope: ['full_access']
      }
    )

    redirectTo = consentAcceptResponse.data?.redirect_to
  }

  if (redirectTo) {
    throw redirect(redirectTo)
  } else {
    // TODO: TMP measure - need proper error handling
    throw json(null, {
      status: 400,
      statusText: 'Unable to skip consent'
    })
  }
}
