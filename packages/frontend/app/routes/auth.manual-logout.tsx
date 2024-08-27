import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Form } from '@remix-run/react'
import { Button } from '../components/ui'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  return null
}

export default function Logout() {
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Log out of Rafiki Admin</h3>
          <div className='space-y-8'>
            <p>Failed to retrieve the logout URL from Kratos</p>
            <p>
              Logout needs to be performed manually either by clicking the
              button below, or closing your browser.
            </p>
            <Form method='post'>
              <Button
                aria-label='manual-logout'
                name='manual-logout'
                type='submit'
              >
                Manual Logout
              </Button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function action() {
  // This action clear the session cookie.
  return redirect('/', {
    headers: {
      'Set-Cookie':
        'ory_kratos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly; Secure; SameSite=Strict'
    }
  })
}
