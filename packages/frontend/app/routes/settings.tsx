import {
  json,
  redirectDocument,
  type LoaderFunctionArgs
} from '@remix-run/node'
import { uuidSchema } from '~/lib/validate.server'
import {
  isUiNodeInputAttributes,
  filterNodesByGroups
} from '@ory/integrations/ui'
import type { UiContainer } from '@ory/client'
import { useLoaderData } from '@remix-run/react'
import { PageHeader } from '~/components'
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
      `${variables.kratosContainerPublicUrl}/self-service/settings/flows?id=${flowId}`,
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
        statusText: 'Could not fetch Kratos account settings fields.'
      })
    }
    const responseData = await response.json()

    return { responseData }
  } else {
    return redirectDocument(
      `${variables.kratosBrowserPublicUrl}/self-service/settings/browser`
    )
  }
}

export default function Settings() {
  const { responseData } = useLoaderData<typeof loader>()
  const uiContainer: UiContainer = responseData.ui
  const uiNodes = uiContainer.nodes
  const profileNodes = filterNodesByGroups({
    nodes: uiNodes,
    groups: ['profile']
  })
  const passwordNodes = filterNodesByGroups({
    nodes: uiNodes,
    groups: ['password']
  })
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
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Account Settings</h3>
            {uiContainer.messages?.map((message) => {
              return <p key={message.id}>{message.text}</p>
            })}
          </div>
        </PageHeader>
        {/* Profile Settings */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Profile</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <form method='post' action={actionUrl}>
              <fieldset>
                <div className='w-full p-4 space-y-3'>
                  {profileNodes.map((field, index) => {
                    const { attributes, meta } = field
                    const label = meta?.label?.text
                    if (
                      isUiNodeInputAttributes(attributes) &&
                      attributes.type !== 'submit'
                    ) {
                      return (
                        <div className='w-full md:w-1/2 lg:w-1/3' key={index}>
                          {attributes.type === 'hidden' ? (
                            <input
                              type='hidden'
                              name={attributes.name}
                              value={attributes.value}
                            />
                          ) : (
                            <div>
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
                          )}
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
                <div className='flex justify-end p-4'>
                  {profileNodes.map((field, index) => {
                    const { attributes, meta } = field
                    if (
                      isUiNodeInputAttributes(attributes) &&
                      attributes.type === 'submit'
                    ) {
                      return (
                        <div key={index}>
                          <Button
                            type={attributes.type}
                            aria-label={
                              attributes.label?.text || attributes.name
                            }
                            name={attributes.name}
                            disabled={attributes.disabled}
                            value={attributes.value}
                            className='ml-2'
                          >
                            {meta?.label?.text || 'Submit'}
                          </Button>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </fieldset>
            </form>
          </div>
        </div>
        {/* Password Settings */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Password</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <form method='post' action={actionUrl}>
              <fieldset>
                <div className='w-full p-4 space-y-3'>
                  {passwordNodes.map((field, index) => {
                    const { attributes, meta } = field
                    const label = meta?.label?.text
                    if (
                      isUiNodeInputAttributes(attributes) &&
                      attributes.type !== 'submit'
                    ) {
                      return (
                        <div className='w-full md:w-1/2 lg:w-1/3' key={index}>
                          {attributes.type === 'hidden' ? (
                            <input
                              type='hidden'
                              name={attributes.name}
                              value={attributes.value}
                            />
                          ) : (
                            <div>
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
                          )}
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
                <div className='flex justify-end p-4'>
                  {passwordNodes.map((field, index) => {
                    const { attributes, meta } = field
                    if (
                      isUiNodeInputAttributes(attributes) &&
                      attributes.type === 'submit'
                    ) {
                      return (
                        <div key={index}>
                          <Button
                            type={attributes.type}
                            aria-label={
                              attributes.label?.text || attributes.name
                            }
                            name={attributes.name}
                            disabled={attributes.disabled}
                            value={attributes.value}
                            className='ml-2'
                          >
                            {meta?.label?.text || 'Submit'}
                          </Button>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
