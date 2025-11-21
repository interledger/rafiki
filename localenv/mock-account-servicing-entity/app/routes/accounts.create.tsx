import { json, type ActionFunctionArgs } from '@remix-run/node'
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation
} from '@remix-run/react'
import { PageHeader, Button, ErrorPanel, Input, Select } from '~/components'
import { loadAssets } from '~/lib/asset.server'
import { createAccount } from '~/lib/accounts.server'
import { createWallet } from '~/lib/wallet.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createAccountSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/lib/types'
import { getOpenPaymentsUrl, getTenantCredentials } from '~/lib/utils'

export async function loader() {
  const session = await messageStorage.getSession()
  const options = await getTenantCredentials(session)
  const assets = await loadAssets(options)

  return json({
    assets,
    options
  })
}

export default function CreateAccountPage() {
  const { assets, options } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-white px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Account</h3>
          <Button aria-label='go back to accounts page' to='/'>
            Go to accounts page
          </Button>
        </PageHeader>
        {/* Create Account form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>

          <fieldset disabled={isSubmitting}>
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='name'
                    label='Account name'
                    placeholder='Account name'
                    error={response?.errors?.fieldErrors.name}
                  />
                  <Input
                    required
                    addOn={`${options?.walletAddressPrefix ?? getOpenPaymentsUrl()}/accounts/`}
                    name='path'
                    label='Wallet address'
                    placeholder='jdoe'
                    error={response?.errors?.fieldErrors.path}
                  />
                  <Select
                    options={assets.map(
                      (asset: {
                        node: { id: string; code: string; scale: number }
                      }) => ({
                        value: asset.node.id,
                        label: `${asset.node.code} (Scale: ${asset.node.scale})`
                      })
                    )}
                    error={response?.errors.fieldErrors.assetId}
                    name='assetId'
                    placeholder='Select asset...'
                    label='Asset'
                    required
                  />
                </div>
              </div>
            </div>
            <div className='flex justify-end py-3'>
              <Button aria-label='create account' type='submit'>
                {isSubmitting ? 'Creating account ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
        {/* Create Account form - END */}
      </div>
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createAccountSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())
  formData.path = `accounts/${formData.path}`

  const result = createAccountSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const options = await getTenantCredentials(session)

  const assets = await loadAssets(options)
  const assetDetail = assets.find(
    (asset: { node: { id: string } }) => asset.node.id == result.data.assetId
  )

  const accountId = await createAccount({
    ...result.data,
    assetCode: assetDetail?.node.code || '',
    assetScale: assetDetail?.node.scale || 0
  })

  if (!accountId) {
    errors.message = ['Could not create account. Please try again!']
    return json({ errors }, { status: 400 })
  }

  await createWallet({ ...result.data, accountId }, options)

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Account created.',
      type: 'success'
    },
    location: `/accounts/${accountId}`
  })
}
