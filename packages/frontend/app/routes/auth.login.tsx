import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { uuidSchema } from '~/lib/validate.server'
import { isUiNodeInputAttributes } from '@ory/integrations/ui'
import type { UiContainer } from '@ory/client'
import { useLoaderData } from '@remix-run/react'
import { Button } from '../components/ui'
import variables from '../utils/envConfig.server'
import { redirectIfAlreadyAuthorized } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfAlreadyAuthorized(request.url, cookies)

  const url = new URL(request.url)
  const flowResult = uuidSchema.safeParse({ id: url.searchParams.get('flow') })
  if (flowResult.success) {
    const flowId = flowResult.data.id
    const response = await fetch(
      `${variables.kratosContainerPublicUrl}/self-service/login/flows?id=${flowId}`,
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
        statusText: 'Could not fetch Kratos login fields.'
      })
    }
    const responseData = await response.json()
    const recoveryUrl = `${variables.kratosBrowserPublicUrl}/self-service/recovery/browser`
    return { responseData, recoveryUrl }
  } else {
    throw json(null, {
      status: 400,
      statusText: 'No Kratos login flow ID found.'
    })
  }
}

export default function Login() {
  const { responseData, recoveryUrl } = useLoaderData<typeof loader>()
  const uiContainer: UiContainer = responseData.ui
  const uiNodes = uiContainer.nodes
  const actionUrl = uiContainer.action
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Login to Rafiki Admin</h3>
          <div className='space-y-8'>
            {uiContainer.messages?.map((message) => {
              return <p key={message.id}>{message.text}</p>
            })}
            <form method='post' action={actionUrl}>
              <div className='p-4 space-y-3'>
                {uiNodes.map((node, index) => {
                  const { attributes, meta } = node
                  if (
                    isUiNodeInputAttributes(attributes) &&
                    attributes.type !== 'submit'
                  ) {
                    const messages = node.messages.map((message) => {
                      return <p key={index}>{message.text}</p>
                    })
                    return (
                      <div key={index}>
                        {attributes.type !== 'hidden' && (
                          <label htmlFor={attributes.name}>
                            {meta?.label?.text || attributes.name}
                          </label>
                        )}
                        <input
                          type={attributes.type}
                          name={attributes.name}
                          required={attributes.required}
                          disabled={attributes.disabled}
                          defaultValue={attributes.value}
                        />
                        <div>{messages}</div>
                      </div>
                    )
                  } else if (
                    isUiNodeInputAttributes(attributes) &&
                    attributes.type === 'submit'
                  ) {
                    return (
                      <div key={index}>
                        <Button
                          type={attributes.type}
                          aria-label='Login'
                          name={attributes.name}
                          disabled={attributes.disabled}
                          value={attributes.value}
                          className='ml-2'
                        >
                          {meta?.label?.text || 'Login'}
                        </Button>
                      </div>
                    )
                  }
                  return null
                })}
                <Button aria-label='account-recovery' href={recoveryUrl}>
                  Forgot password?
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
