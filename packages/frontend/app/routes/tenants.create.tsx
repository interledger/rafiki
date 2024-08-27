import { json, type ActionFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useNavigation } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input } from '~/components/ui'

import { createTenant } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createTenantSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies, { checkIsOperator: true })
  return null
}

export default function CreateTenantPage() {
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Tenant</h3>
          <Button aria-label='go back to tenants page' to='/tenants'>
            Go to tenants page
          </Button>
        </PageHeader>
        {/* Create Tenant form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>

          <fieldset disabled={isSubmitting}>
            {/* Tenant General Info */}
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    required
                    name='email'
                    label='Email'
                    placeholder='Email'
                    error={response?.errors?.fieldErrors.email}
                  />
                  <Input
                    required
                    name='webhookUrl'
                    label='Webhook URL'
                    placeholder='Webhook URL'
                    error={response?.errors?.fieldErrors.webhookUrl}
                  />
                  <Input
                    required
                    name='idpSecret'
                    label='Identity Provider Secret'
                    placeholder='Identity Provider Secret'
                    error={response?.errors.fieldErrors.idpSecret}
                  />
                  <Input
                    required
                    name='idpConsentUrl'
                    label='Identity Provider Consent Page URL'
                    placeholder='Identity Provider Consent Page URL'
                    error={response?.errors.fieldErrors.idpConsentUrl}
                  />
                </div>
              </div>
            </div>
            <div className='flex justify-end py-3'>
              <Button aria-label='create tenant' type='submit'>
                {isSubmitting ? 'Creating tenant ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
        {/* Create Tenant form - END */}
      </div>
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

  const formData = Object.fromEntries(await request.formData())

  const result = createTenantSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const cookies = request.headers.get('cookie')
  const response = await createTenant(
    {
      ...result.data
    },
    cookies as string
  )

  if (!response?.tenant) {
    errors.message = ['Could not create tenant. Please try again!']
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(cookies)

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Tenant created.',
      type: 'success'
    },
    location: `/tenants/${response.tenant.id}`
  })
}