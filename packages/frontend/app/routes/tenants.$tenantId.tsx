import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs
} from '@remix-run/node'
import {
  Form,
  Outlet,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit
} from '@remix-run/react'
import { type FormEvent, useRef, useState } from 'react'
import type { ZodSchema } from 'zod'
import { z } from 'zod'
import { DangerZone } from '~/components'
import { Box, Button, Card, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import { ErrorPanel, FieldError } from '~/components/ui'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { updateTenant, deleteTenant, whoAmI } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import {
  updateTenantGeneralSchema,
  updateTenantIdpSchema,
  updateTenantSensitiveSchema,
  uuidSchema
} from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { getTenantInfo } from '~/lib/api/tenant.server'
import type { UpdateTenantInput } from '~/generated/graphql'

type FormFieldProps = {
  name: string
  label: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'
  error?: string | string[]
  required?: boolean
  defaultValue?: string
  value?: string
  disabled?: boolean
  readOnly?: boolean
}

const FormField = ({
  name,
  label,
  placeholder,
  type = 'text',
  error,
  required,
  defaultValue,
  value,
  disabled,
  readOnly
}: FormFieldProps) => (
  <Flex direction='column' gap='2'>
    <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
      <label htmlFor={name}>
        {label}
        {required ? <span className='text-vermillion'> *</span> : null}
      </label>
    </Text>
    <TextField.Root
      id={name}
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
      defaultValue={defaultValue}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      size='3'
      className='w-full'
    />
    <FieldError error={error} />
  </Flex>
)

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const tenantId = params.tenantId
  const result = z.string().uuid().safeParse(tenantId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid tenant ID.' })
  }

  const tenant = await getTenantInfo(request, { id: result.data })
  if (!tenant)
    throw json(null, { status: 404, statusText: 'Tenant not found.' })

  const tenantDeleted = tenant.deletedAt ? tenant.deletedAt.length > 0 : false
  const me = await whoAmI(request)
  return json({ tenant, me, tenantDeleted })
}

export default function ViewTenantPage() {
  const { tenant, me, tenantDeleted } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const navigation = useNavigation()
  const [formData, setFormData] = useState<FormData>()

  const submit = useSubmit()
  const dialogRef = useRef<ConfirmationDialogRef>(null)

  const isSubmitting = navigation.state === 'submitting'

  const submitHandler = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormData(new FormData(event.currentTarget))
    dialogRef.current?.display()
  }

  const onConfirm = () => {
    if (formData) submit(formData, { method: 'post' })
  }

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Tenant Details</Heading>

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='5'>
            <Flex direction='column' gap='4'>
              <Flex align='center' justify='between' gap='3' wrap='wrap'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  General Information
                </Text>
                <Text size='2' color='gray'>
                  {`Created at ${new Date(tenant.createdAt).toLocaleString()}`}
                  {tenantDeleted && tenant.deletedAt
                    ? ` · Deleted at ${new Date(tenant.deletedAt).toLocaleString()}`
                    : ''}
                </Text>
              </Flex>
              <ErrorPanel errors={response?.errors?.general.message} />
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={isSubmitting}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={tenant.id} />
                    <FormField
                      label='Tenant ID'
                      name='tenantId'
                      value={tenant.id}
                      disabled
                      readOnly
                    />
                    <FormField
                      label='Public Name'
                      name='publicName'
                      disabled={tenantDeleted}
                      defaultValue={tenant.publicName ?? undefined}
                      error={response?.errors?.general.fieldErrors.publicName}
                    />
                    <FormField
                      label='Email'
                      name='email'
                      type='email'
                      disabled={tenantDeleted}
                      defaultValue={tenant.email ?? undefined}
                      error={response?.errors?.general.fieldErrors.email}
                    />
                  </Flex>
                  <Flex justify='end' mt='4'>
                    {!tenantDeleted && (
                      <Button
                        aria-label='save general information'
                        type='submit'
                        name='intent'
                        value='general'
                      >
                        {isSubmitting ? 'Saving ...' : 'Save'}
                      </Button>
                    )}
                  </Flex>
                </fieldset>
              </Form>
            </Flex>

            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Identity Provider Information
              </Text>
              <ErrorPanel errors={response?.errors?.idp.message} />
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={isSubmitting}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={tenant.id} />
                    <FormField
                      name='idpConsentUrl'
                      label='Consent URL'
                      disabled={tenantDeleted}
                      defaultValue={tenant.idpConsentUrl ?? undefined}
                      error={response?.errors?.idp.fieldErrors.idpConsentUrl}
                    />
                    <FormField
                      name='idpSecret'
                      label='Secret'
                      type='password'
                      disabled={tenantDeleted}
                      defaultValue={tenant.idpSecret ?? undefined}
                      error={response?.errors?.idp.fieldErrors.idpSecret}
                    />
                  </Flex>
                  <Flex justify='end' mt='4'>
                    {!tenantDeleted && (
                      <Button
                        aria-label='save idp information'
                        type='submit'
                        name='intent'
                        value='idp'
                      >
                        {isSubmitting ? 'Saving ...' : 'Save'}
                      </Button>
                    )}
                  </Flex>
                </fieldset>
              </Form>
            </Flex>

            {me.isOperator && (
              <Flex direction='column' gap='4'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  Sensitive Information
                </Text>
                <ErrorPanel errors={response?.errors?.sensitive.message} />
                <Form method='post' replace preventScrollReset>
                  <fieldset disabled={isSubmitting}>
                    <Flex direction='column' gap='4'>
                      <input type='hidden' name='id' value={tenant.id} />
                      <FormField
                        name='apiSecret'
                        label='API Secret'
                        type='password'
                        value={tenant.apiSecret}
                        required
                        disabled={me.isOperator}
                      />
                    </Flex>
                    <Flex justify='end' mt='4'>
                      {!tenantDeleted && !me.isOperator && (
                        <Button
                          aria-label='save sensitive information'
                          type='submit'
                          name='intent'
                          value='sensitive'
                        >
                          {isSubmitting ? 'Saving ...' : 'Save'}
                        </Button>
                      )}
                    </Flex>
                  </fieldset>
                </Form>
              </Flex>
            )}

            {!tenantDeleted && me.isOperator && me.id !== tenant.id && (
              <DangerZone title='Delete Tenant'>
                <Form method='post' onSubmit={submitHandler}>
                  <input type='hidden' name='id' value={tenant.id} />
                  <input type='hidden' name='intent' value='delete' />
                  <Button type='submit' color='red' aria-label='delete tenant'>
                    Delete tenant
                  </Button>
                </Form>
              </DangerZone>
            )}
          </Flex>
        </Card>

        <ConfirmationDialog
          ref={dialogRef}
          onConfirm={onConfirm}
          title={`Delete Tenant ${tenant.publicName}`}
          keyword={'delete tenant'}
          confirmButtonText='Delete this tenant'
        />
      </Flex>
      <Outlet />
    </Box>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const actionResponse: {
    errors: {
      general: {
        fieldErrors: ZodFieldErrors<typeof updateTenantGeneralSchema>
        message: string[]
      }
      idp: {
        fieldErrors: ZodFieldErrors<typeof updateTenantIdpSchema>
        message: string[]
      }
      sensitive: {
        fieldErrors: ZodFieldErrors<typeof updateTenantSensitiveSchema>
        message: string[]
      }
    }
  } = {
    errors: {
      general: {
        fieldErrors: {},
        message: []
      },
      idp: {
        fieldErrors: {},
        message: []
      },
      sensitive: {
        fieldErrors: {},
        message: []
      }
    }
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  async function handleUpdateFormSubmit<T extends UpdateTenantInput>(
    errorKey: keyof typeof actionResponse.errors,
    schema: ZodSchema<T>
  ) {
    const formEntries = Object.fromEntries(formData)
    const result = schema.safeParse(formEntries)

    if (!result.success) {
      actionResponse.errors[errorKey].fieldErrors =
        result.error.flatten().fieldErrors
      return json(actionResponse, { status: 400 })
    }

    const response = await updateTenant(request, { ...result.data })

    if (!response?.tenant) {
      actionResponse.errors[errorKey].message = [
        'Could not update tenant. Please try again!'
      ]
      return json(actionResponse, { status: 400 })
    }

    return { formEntries }
  }

  switch (intent) {
    case 'general': {
      const result = await handleUpdateFormSubmit(
        intent,
        updateTenantGeneralSchema
      )
      if (!('formEntries' in result)) return result
      break
    }
    case 'idp': {
      const result = await handleUpdateFormSubmit(intent, updateTenantIdpSchema)
      if (!('formEntries' in result)) return result
      break
    }
    case 'sensitive': {
      const result = await handleUpdateFormSubmit(
        intent,
        updateTenantSensitiveSchema
      )

      if (!('formEntries' in result)) return result

      const me = await whoAmI(request)
      if (
        result.formEntries.apiSecret &&
        me.id === result.formEntries.id &&
        !me.isOperator
      ) {
        session.set('apiSecret', result.formEntries.apiSecret)
      }
      break
    }
    case 'delete': {
      const result = uuidSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        return setMessageAndRedirect({
          session,
          message: { content: 'Invalid tenant ID.', type: 'error' },
          location: '.'
        })
      }

      const response = await deleteTenant(request, result.data.id)
      if (!response) {
        return setMessageAndRedirect({
          session,
          message: { content: 'Could not delete Tenant.', type: 'error' },
          location: '.'
        })
      }

      return setMessageAndRedirect({
        session,
        message: { content: 'Tenant was deleted.', type: 'success' },
        location: '/tenants'
      })
    }
    default:
      throw json(null, { status: 400, statusText: 'Invalid intent.' })
  }

  return setMessageAndRedirect({
    session,
    message: { content: 'Tenant information was updated', type: 'success' },
    location: '.'
  })
}
