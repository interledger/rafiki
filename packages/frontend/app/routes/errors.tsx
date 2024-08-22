// This page handles User-facing errors in the browser for Kratos
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import variables from '../lib/envConfig.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const url = new URL(request.url)

  const id = url.searchParams.get('id')
  if (id) {
    const response = await fetch(
      `${variables.kratosContainerPublicUrl}/self-service/errors?id=${id}`,
      {
        headers: {
          Cookie: cookies || ''
        },
        credentials: 'include'
      }
    )
    if (!response.ok) {
      throw json(null, {
        status: 400,
        statusText: 'Could not fetch Kratos error fields.'
      })
    }
    const responseData = await response.json()

    return { responseData }
  } else {
    throw json(null, {
      status: 400,
      statusText: 'No Kratos error id found.'
    })
  }
}

export default function Errors() {
  const { responseData } = useLoaderData<typeof loader>()
  const error = responseData.error

  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Oops something went wrong</h3>
          <div className='space-y-8'>
            <p>
              {error.code}: {error.status}
            </p>
            <p>{error.message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
