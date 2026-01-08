import {
  json,
  type LoaderFunctionArgs,
  redirectDocument
} from '@remix-run/node'
import { uuidSchema } from '~/lib/validate.server'
import { isUiNodeInputAttributes } from '@ory/integrations/ui'
import type { UiContainer } from '@ory/client'
import { useLoaderData } from '@remix-run/react'
import { Button, TextField } from '@radix-ui/themes'
import { FieldError, Label } from '../components/ui'
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
      `${variables.kratosContainerPublicUrl}/self-service/recovery/flows?id=${flowId}`,
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
        statusText: 'Could not fetch Kratos account recovery fields.'
      })
    }
    const responseData = await response.json()

    return { responseData }
  } else {
    return redirectDocument(
      `${variables.kratosBrowserPublicUrl}/self-service/recovery/browser`
    )
  }
}

export default function Recovery() {
  const { responseData } = useLoaderData<typeof loader>()
  const uiContainer: UiContainer = responseData.ui
  const uiNodes = uiContainer.nodes
  const actionUrl = uiContainer.action
  type TextFieldType =
    | 'text'
    | 'email'
    | 'password'
    | 'number'
    | 'tel'
    | 'url'
    | 'search'
    | 'date'
    | 'datetime-local'
    | 'time'
    | 'week'
    | 'month'
    | 'hidden'
  const normalizeType = (type: string): TextFieldType => {
    const allowed: TextFieldType[] = [
      'text',
      'email',
      'password',
      'number',
      'tel',
      'url',
      'search',
      'date',
      'datetime-local',
      'time',
      'week',
      'month',
      'hidden'
    ]
    return allowed.includes(type as TextFieldType)
      ? (type as TextFieldType)
      : 'text'
  }
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h3 className='text-2xl pt-16'>Recover Rafiki Admin Account</h3>
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
                          attributes.type === 'hidden' ? (
                            <input
                              key={index}
                              type='hidden'
                              name={attributes.name}
                              value={attributes.value}
                            />
                          ) : (
                            <div key={index}>
                              <Label
                                htmlFor={attributes.name}
                                required={attributes.required}
                              >
                                {label}
                              </Label>
                              <TextField.Root
                                id={attributes.name}
                                type={normalizeType(attributes.type)}
                                name={attributes.name}
                                required={attributes.required}
                                disabled={attributes.disabled}
                                defaultValue={attributes.value}
                                size='3'
                                className='w-full'
                              />
                              <FieldError
                                error={field.messages
                                  .map((message) => message.text)
                                  .join('; ')}
                              />
                            </div>
                          )
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
                            {meta?.label?.text || 'Submit'}
                          </Button>
                        )
                      }
                      return null
                    })}
                  </div>
                </fieldset>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
