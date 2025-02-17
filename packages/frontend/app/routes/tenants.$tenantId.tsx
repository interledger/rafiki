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
import { type FormEvent, useState, useRef } from 'react'
import { z } from 'zod'
import { DangerZone, PageHeader } from '~/components'
import { Button, ErrorPanel, Input, PasswordInput } from '~/components/ui'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { updateTenant, deleteTenant, whoAmI } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import type { createTenantSchema } from '~/lib/validate.server'
import { updateTenantSchema, uuidSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { getTenantInfo } from '~/lib/api/tenant.server'

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
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader className='!justify-end'>
          <Button aria-label='go back to tenants page' to='/tenants'>
            Go to tenants page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>
              {`Created at ${new Date(tenant.createdAt).toLocaleString()}`}
              {tenantDeleted && tenant.deletedAt && (
                <>
                  <br />
                  {`Deleted at ${new Date(tenant.deletedAt).toLocaleString()}`}
                </>
              )}
            </p>
            <ErrorPanel errors={response?.errors.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={tenant.id} />
                  <Input
                    type='hidden'
                    name='apiSecret'
                    value={tenant.apiSecret}
                  />
                  <Input
                    label='Tenant ID'
                    name='tenantId'
                    value={tenant.id}
                    disabled
                    readOnly
                  />
                  <Input
                    label='Public Name'
                    name='publicName'
                    disabled={tenantDeleted}
                    defaultValue={tenant.publicName ?? undefined}
                    error={response?.errors?.fieldErrors.publicName}
                  />
                  <Input
                    label='Email'
                    name='email'
                    disabled={tenantDeleted}
                    defaultValue={tenant.email ?? undefined}
                    error={response?.errors?.fieldErrors.email}
                  />
                </div>
                <div className='flex justify-end p-4'>
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
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Identity Provider Information */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>
              Identity Provider Information
            </h3>
            <ErrorPanel errors={response?.errors?.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={tenant.id} />
                  <Input
                    type='hidden'
                    name='apiSecret'
                    value={tenant.apiSecret}
                  />
                  <Input
                    name='idpConsentUrl'
                    label='Consent URL'
                    disabled={tenantDeleted}
                    defaultValue={tenant.idpConsentUrl ?? undefined}
                    error={response?.errors?.fieldErrors.idpConsentUrl}
                  />
                  <PasswordInput
                    name='idpSecret'
                    label='Secret'
                    disabled={tenantDeleted}
                    defaultValue={tenant.idpSecret ?? undefined}
                    error={response?.errors?.fieldErrors.idpSecret}
                  />
                </div>
                <div className='flex justify-end p-4'>
                  {!tenantDeleted && (
                    <Button
                      aria-label='save ip information'
                      type='submit'
                      name='intent'
                      value='ip'
                    >
                      {isSubmitting ? 'Saving ...' : 'Save'}
                    </Button>
                  )}
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Identity Provider Information - END */}
        {/* Sensitive Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Sensitive Information</h3>
            <ErrorPanel errors={response?.errors.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={tenant.id} />
                  <PasswordInput
                    name='apiSecret'
                    label='API Secret'
                    value={tenant.apiSecret}
                    required
                    disabled
                  />
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Sensitive - END */}
        {/* DELETE TENANT - Danger zone */}
        {!tenantDeleted && me.isOperator && me.id !== tenant.id && (
          <DangerZone title='Delete Tenant'>
            <Form method='post' onSubmit={submitHandler}>
              <Input type='hidden' name='id' value={tenant.id} />
              <Input type='hidden' name='intent' value='delete' />
              <Button type='submit' intent='danger' aria-label='delete tenant'>
                Delete tenant
              </Button>
            </Form>
          </DangerZone>
        )}
        <ConfirmationDialog
          ref={dialogRef}
          onConfirm={onConfirm}
          title={`Delete Tenant ${tenant.publicName}`}
          keyword={'delete tenant'}
          confirmButtonText='Delete this tenant'
        />
      </div>
      <Outlet />
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createTenantSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  switch (intent) {
    case 'general':
    case 'ip':
    case 'sensitive': {
      const formEntries = Object.fromEntries(formData)
      const result = updateTenantSchema.safeParse(formEntries)
      if (!result.success) {
        errors.fieldErrors = result.error.flatten().fieldErrors
        return json({ errors }, { status: 400 })
      }

      const response = await updateTenant(request, {
        ...result.data
      })

      if (!response?.tenant) {
        errors.message = ['Could not update tenant. Please try again!']
        return json({ errors }, { status: 400 })
      }

      const me = await whoAmI(request)
      // We update the apiSecret of the session in case it changed.
      if (formEntries.apiSecret && me.id === formEntries.id) {
        session.set('apiSecret', formEntries.apiSecret)
      }
      break
    }
    case 'delete': {
      const result = uuidSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        return setMessageAndRedirect({
          session,
          message: {
            content: 'Invalid tenant ID.',
            type: 'error'
          },
          location: '.'
        })
      }

      const response = await deleteTenant(request, result.data.id)
      if (!response) {
        return setMessageAndRedirect({
          session,
          message: {
            content: 'Could not delete Tenant.',
            type: 'error'
          },
          location: '.'
        })
      }

      return setMessageAndRedirect({
        session,
        message: {
          content: 'Tenant was deleted.',
          type: 'success'
        },
        location: '/tenants'
      })
    }
    default:
      throw json(null, { status: 400, statusText: 'Invalid intent.' })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Tenant information was updated',
      type: 'success'
    },
    location: '.'
  })
}
