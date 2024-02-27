import {
  redirect,
  json,
  type LoaderArgs,
  type ActionArgs
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import axios from 'axios'
import qs from 'qs'
import { authStorage, setApiToken } from '../lib/auth.server'

export default function Callback() {
  const data = useLoaderData<typeof loader>()
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
            <p>Looading...</p>
            <form ref={formRef} method='post'>
              <input
                type='hidden'
                name='code'
                value={data.authorizationCode || ''}
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const authorizationCode = url.searchParams.get('code')
  if (!authorizationCode) {
    throw new Error('Authorization code not found')
  }
  return json({ authorizationCode })
}

export const action = async ({ request }: ActionArgs) => {
  const formData = await request.formData()
  const authorizationCode = formData.get('code')

  // Redirect or return a response
  try {
    const response = await axios.post(
      'http://hydra:4444/oauth2/token',
      qs.stringify({
        client_id: process.env.HYDRA_CLIENT_ID,
        client_secret: 'YourClientSecret',
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: process.env.HYDRA_CLIENT_REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const session = await authStorage.getSession(request.headers.get('cookie'))
    setApiToken(session, response.data.access_token)
    return redirect('/', {
      headers: { 'Set-Cookie': await authStorage.commitSession(session) }
    })
  } catch (error) {
    throw new Error(`There was an error: ${error}`)
  }
}
