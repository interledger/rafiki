import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs
} from '@remix-run/node'
import {
  Form,
  Outlet,
  useActionData,
  useFormAction,
  useLoaderData,
  useNavigation,
  useSubmit
} from '@remix-run/react'
import { type FormEvent, useState, useRef } from 'react'
import { z } from 'zod'
import { DangerZone, PageHeader } from '~/components'
import { Button, Input } from '~/components/ui'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { uuidSchema } from '~/lib/validate.server'
import { getTenant, deleteTenant } from '~/lib/api/tenant.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies, { checkIsOperator: true })

  const tenantId = params.tenantId

  const result = z.string().uuid().safeParse(tenantId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid tenant ID.' })
  }

  const tenant = await getTenant({ id: result.data }, cookies as string)

  if (!tenant) {
    throw json(null, { status: 404, statusText: 'Tenant not found.' })
  }

  return json({ tenant })
}

export default function ViewTenantPage() {
  const { tenant } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const formAction = useFormAction()
  const submit = useSubmit()
  const dialogRef = useRef<ConfirmationDialogRef>(null)

  const isSubmitting = navigation.state === 'submitting'
  const currentPageAction = isSubmitting && navigation.formAction === formAction

  const [formData, setFormData] = useState<FormData>()

  const submitHandler = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormData(new FormData(event.currentTarget))
    dialogRef.current?.display()
  }

  const onConfirm = () => {
    if (formData) {
      submit(formData, { method: 'post' })
    }
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
              Created at {new Date(tenant.createdAt).toLocaleString()}
            </p>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={currentPageAction}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={tenant.id} />
                  <Input label='Email' value={tenant.email} disabled readOnly />
                  <Input
                    label='Tenant ID'
                    value={tenant.id}
                    disabled
                    readOnly
                  />
                  <Input
                    label='Webhook URL'
                    value={tenant.webhookUrl}
                    disabled
                    readOnly
                  />
                  <Input
                    label='Identity Provider Consent Screen Url'
                    value={tenant.idpConsentUrl}
                    disabled
                    readOnly
                  />
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* DELETE TENANT - Danger zone */}
        <DangerZone title='Delete Tenant'>
          <Form method='post' onSubmit={submitHandler}>
            <Input type='hidden' name='id' value={tenant.id} />
            <Input type='hidden' name='intent' value='delete' />
            <Button type='submit' intent='danger' aria-label='delete tenant'>
              Delete tenant
            </Button>
          </Form>
        </DangerZone>
      </div>
      <ConfirmationDialog
        ref={dialogRef}
        onConfirm={onConfirm}
        title={`Delete Tenant`}
        keyword={'delete tenant'}
        confirmButtonText='Delete this tenant'
      />
      <Outlet />
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const cookies = request.headers.get('cookie')
  const session = await messageStorage.getSession(cookies)
  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  switch (intent) {
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

      const response = await deleteTenant(
        { id: result.data.id },
        cookies as string
      )
      if (!response?.tenant) {
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
        location: '/tenant'
      })
    }
    default:
      throw json(null, { status: 400, statusText: 'Invalid intent.' })
  }
}
