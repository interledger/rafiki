import {
  json,
  type LoaderFunctionArgs,
  redirectDocument
} from '@remix-run/node'
import { uuidSchema } from '~/lib/validate.server'
import { isUiNodeInputAttributes } from '@ory/integrations/ui'
import type { UiContainer } from '@ory/client'
import { useLoaderData } from '@remix-run/react'
import { Button, Input } from '../components/ui'
import variables from '../lib/envConfig.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

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
    return redirectDocument(
      `${variables.kratosBrowserPublicUrl}/self-service/login/browser`
    )
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
            <form
              method='post'
              action={actionUrl}
              className='flex justify-center flex-col items-center'
            >
              <div className='max-w-sm'>
                <fieldset>
                  <div className='p-4 space-y-3'>
                    {uiNodes.map((field, index) => {
                      const { attributes, meta } = field
                      const label = meta?.label?.text
                      if (
                        isUiNodeInputAttributes(attributes) &&
                        attributes.type !== 'submit'
                      ) {
                        return (
                          <Input
                            key={index}
                            type={attributes.type}
                            name={attributes.name}
                            required={attributes.required}
                            disabled={attributes.disabled}
                            defaultValue={attributes.value}
                            label={
                              attributes.type !== 'hidden' ? label : undefined
                            }
                            error={field.messages
                              .map((message) => message.text)
                              .join('; ')}
                          />
                        )
                      }
                      return null
                    })}
                  </div>
                  <div className='flex p-4 justify-center'>
                    {uiNodes.map((field, index) => {
                      const { attributes, meta } = field
                      if (
                        isUiNodeInputAttributes(attributes) &&
                        attributes.type === 'submit'
                      ) {
                        return (
                          <Button
                            key={index}
                            type={attributes.type}
                            aria-label={
                              attributes.label?.text || attributes.name
                            }
                            name={attributes.name}
                            disabled={attributes.disabled}
                            value={attributes.value}
                          >
                            {meta?.label?.text || 'Login'}
                          </Button>
                        )
                      }
                      return null
                    })}
                  </div>
                </fieldset>
              </div>
            </form>
            <a aria-label='account-recovery' href={recoveryUrl}>
              Forgot password?
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
