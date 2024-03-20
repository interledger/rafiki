import {
  redirect,
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import axios from 'axios'
import qs from 'qs'
import { authStorage, setApiToken } from '../lib/auth.server'
import variables from '../utils/envConfig.server'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)

  const url = new URL(request.url)
  const authorizationCode = url.searchParams.get('code')
  if (!authorizationCode || typeof authorizationCode !== 'string') {
    throw json(null, {
      status: 400,
      statusText: 'Could not find Hydra authorization code.'
    })
  }

  return json({ authorizationCode })
}

export default function Callback() {
  const { authorizationCode } = useLoaderData<typeof loader>()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Automatically submit the form when the component mounts
    formRef.current?.submit()
  }, [])

  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Login to Rafiki Admin</h3>
          <div className='space-y-8'>
            <p>Loading...</p>
            <p>Please wait a moment while the access token is retrieved.</p>
            <form ref={formRef} method='post'>
              <input type='hidden' name='code' value={authorizationCode} />
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData()
  const authorizationCode = formData.get('code')
  if (!authorizationCode || typeof authorizationCode !== 'string') {
    throw json(null, {
      status: 400,
      statusText: 'Could not extract Hydra authorization code.'
    })
  }

  const response = await axios.post(
    `${variables.hydraPublicUrl}/oauth2/token`,
    qs.stringify({
      client_id: process.env.HYDRA_CLIENT_ID,
      client_secret: process.env.HYDRA_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: variables.hydraClientRedirectUri
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  )

  if (response.status !== 200) {
    throw json(null, {
      status: response.status,
      statusText: response.statusText
    })
  }

  const session = await authStorage.getSession(request.headers.get('cookie'))
  setApiToken(session, response.data.access_token)
  return redirect('/', {
    headers: { 'Set-Cookie': await authStorage.commitSession(session) }
  })
}
