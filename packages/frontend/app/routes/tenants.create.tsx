import { json, type ActionFunctionArgs, redirect } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input, PasswordInput } from '~/components/ui'
import { createTenant, whoAmI } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createTenantSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  const me = await whoAmI(request)
  return json({ me })
}

export default function CreateTenantPage() {
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'
  const { me } = useLoaderData<typeof loader>()
  if (!me || !me.isOperator) throw redirect('tenants')

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
                    name='publicName'
                    label='Public Name'
                    placeholder='Public name'
                    error={response?.errors?.fieldErrors.publicName}
                  />
                  <Input
                    name='email'
                    label='Email'
                    placeholder='Email'
                    error={response?.errors?.fieldErrors.email}
                  />
                </div>
              </div>
            </div>
            {/* Tenant General Info - END */}
            {/* Tenant Sensitive Info */}
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Sensitive Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <PasswordInput
                    name='apiSecret'
                    label='API Secret'
                    placeholder='The API secret. Treat as sensitive information.'
                    error={response?.errors?.fieldErrors.apiSecret}
                    required
                  />
                </div>
              </div>
            </div>
            {/* Tenant Sensitive Info - END */}
            {/* Tenant Identity Provider */}
            <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>
                  Identity Provider Information
                </h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='idpConsentUrl'
                    label='Consent URL'
                    placeholder='Provide the Identity Provider Consent URL'
                    error={response?.errors?.fieldErrors.idpConsentUrl}
                  />
                  <PasswordInput
                    name='idpSecret'
                    label='Secret'
                    placeholder='Provide the Identity Provider Secret'
                    error={response?.errors?.fieldErrors.idpSecret}
                  />
                </div>
              </div>
            </div>
            {/* Tenant Identity Provider - End */}
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

  const response = await createTenant(request, { ...result.data })
  if (!response?.tenant) {
    errors.message = ['Could not create tenant. Please try again!']
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Tenant created.',
      type: 'success'
    },
    location: `/tenants/${response.tenant?.id}`
  })
}
