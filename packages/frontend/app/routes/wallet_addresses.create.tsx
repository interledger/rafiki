import { json, type ActionArgs } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input, Select } from '~/components/ui'
import { loadAssets } from '~/lib/api/asset.server'
import { createWalletAddress } from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createWalletAddressSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { getOpenPaymentsUrl } from '~/shared/utils'

export async function loader() {
  return json({ assets: await loadAssets() })
}

export default function CreateWalletAddressPage() {
  const { assets } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Wallet Address</h3>
          <Button
            aria-label='go back to wallet addresses page'
            to='/wallet-addresses'
          >
            Go back to wallet addresses page
          </Button>
        </PageHeader>
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
                    required
                    addOn={getOpenPaymentsUrl()}
                    name='name'
                    label='Wallet address name'
                    placeholder='jdoe'
                    error={response?.errors?.fieldErrors.name}
                  />
                  <Input
                    name='publicName'
                    label='Public name'
                    placeholder='Public name'
                    error={response?.errors?.fieldErrors.publicName}
                  />
                  <Select
                    options={assets.map((asset) => ({
                      value: asset.node.id,
                      label: `${asset.node.code} (Scale: ${asset.node.scale})`
                    }))}
                    error={response?.errors.fieldErrors.asset}
                    name='asset'
                    placeholder='Select asset...'
                    label='Asset'
                    required
                  />
                </div>
              </div>
            </div>
            <div className='flex justify-end py-3'>
              <Button aria-label='create wallet address' type='submit'>
                {isSubmitting ? 'Creating wallet address ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createWalletAddressSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = createWalletAddressSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const response = await createWalletAddress({
    url: `${getOpenPaymentsUrl()}${result.data.name}`,
    publicName: result.data.publicName,
    assetId: result.data.asset
  })

  if (!response?.success) {
    errors.message = [
      response?.message ?? 'Could not create wallet address. Please try again!'
    ]
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Wallet address was created.',
      type: 'success'
    },
    location: `/wallet-addresses/${response.walletAddress?.id}`
  })
}
