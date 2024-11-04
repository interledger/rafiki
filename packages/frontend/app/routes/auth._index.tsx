import { Form } from '@remix-run/react'
import { Button } from '../components/ui'
import variables from '../lib/envConfig.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { redirectDocument, type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  return null
}

export default function Auth() {
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-7rem)] md:min-h-[calc(100vh-3rem)]'>
        <div className='p-4 space-y-6 md:p-10 md:space-y-16'>
          <h1 className='text-6xl pt-10 md:text-9xl md:pt-16 text-[#F37F64]'>
            Welcome!
          </h1>
          <div className='space-y-8'>
            <p className='text-4xl md:text-7xl'>Rafiki Admin</p>
            <p>This is Rafiki&apos;s administrative user interface.</p>
          </div>
          <p>
            In this web application, you&apos;ll be able to manage peering
            relationships, assets, and wallet addresses, among other settings.
          </p>
          <p>
            <a href='https://rafiki.dev' className='font-semibold'>
              https://rafiki.dev
            </a>
          </p>
          <div>
            <Form method='post'>
              <Button aria-label='login' type='submit' className='mr-2'>
                Login
              </Button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function action() {
  return redirectDocument(
    `${variables.kratosBrowserPublicUrl}/self-service/login/browser`
  )
}
