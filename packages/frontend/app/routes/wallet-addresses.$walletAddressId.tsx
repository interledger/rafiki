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
  useNavigation
} from '@remix-run/react'
import { z } from 'zod'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input, Dropdown } from '~/components/ui'
import {
  getWalletAddress,
  updateWalletAddress
} from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { updateWalletAddressSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { capitalize, formatAmount } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const walletAddressId = params.walletAddressId

  const result = z.string().uuid().safeParse(walletAddressId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid wallet address ID.' })
  }

  const walletAddress = await getWalletAddress(request, { id: result.data })

  if (!walletAddress) {
    throw json(null, { status: 404, statusText: 'Wallet address not found.' })
  }

  return json({ walletAddress })
}

export default function ViewWalletAddressPage() {
  const { walletAddress } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const navigation = useNavigation()

  const isSubmitting = navigation.state === 'submitting'
  const displayLiquidityAmount = `${formatAmount(
    walletAddress.liquidity ?? '0',
    walletAddress.asset.scale
  )} ${walletAddress.asset.code}`

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader className='!justify-end'>
          <Button
            aria-label='go back to wallet addresses page'
            to='/wallet-addresses'
          >
            Go to wallet addresses page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>
              Created at {new Date(walletAddress.createdAt).toLocaleString()}
            </p>
            <ErrorPanel errors={response?.errors.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={walletAddress.id} />
                  <Input
                    label='ID'
                    value={walletAddress.id}
                    disabled
                    readOnly
                  />
                  <Input
                    label='URL'
                    value={walletAddress.address}
                    disabled
                    readOnly
                  />
                  <Input
                    name='publicName'
                    label='Public name'
                    defaultValue={walletAddress.publicName ?? undefined}
                    error={response?.errors.fieldErrors.publicName}
                  />
                  <Dropdown
                    options={[
                      { label: 'Active', value: 'ACTIVE' },
                      { label: 'Inactive', value: 'INACTIVE' }
                    ]}
                    name='status'
                    placeholder='Select status...'
                    defaultValue={{
                      label: capitalize(walletAddress.status),
                      value: walletAddress.status
                    }}
                    error={response?.errors.fieldErrors.status}
                    label='Status'
                    required
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button
                    aria-label='save wallet address information'
                    type='submit'
                  >
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Asset Information</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Code</p>
                <p className='mt-1'>{walletAddress.asset.code}</p>
              </div>
              <div>
                <p className='font-medium'>Scale</p>
                <p className='mt-1'>{walletAddress.asset.scale}</p>
              </div>
              <div>
                <p className='font-medium'>Withdrawal threshold</p>
                <p className='mt-1'>
                  {walletAddress.asset.withdrawalThreshold ??
                    'No withdrawal threshold'}
                </p>
              </div>
            </div>
            <div className='flex justify-end p-4'>
              <Button
                aria-label='go to asset page'
                type='button'
                to={`/assets/${walletAddress.asset.id}`}
              >
                View asset
              </Button>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Liquidity Information</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 flex justify-between items-center'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>{displayLiquidityAmount}</p>
              </div>
              <div className='flex space-x-4'>
                {BigInt(walletAddress.liquidity ?? '0') ? (
                  <Button
                    aria-label='withdraw wallet address liquidity page'
                    preventScrollReset
                    to={`/wallet-addresses/${walletAddress.id}/withdraw-liquidity`}
                  >
                    Withdraw
                  </Button>
                ) : (
                  <Button
                    disabled={true}
                    aria-label='withdraw wallet address liquidity page'
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Payments</h3>
            <p className='text-sm'>
              View the payments involving this wallet address on the payments
              page
            </p>
          </div>
          <div className='md:col-span-2'>
            <div className='flex justify-end p-4'>
              <Button
                aria-label='go to payments page'
                to={`/payments?walletAddressId=${walletAddress.id}`}
              >
                Go to payments page
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Outlet context={displayLiquidityAmount} />
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const actionResponse: {
    errors: {
      fieldErrors: ZodFieldErrors<typeof updateWalletAddressSchema>
      message: string[]
    }
  } = {
    errors: {
      fieldErrors: {},
      message: []
    }
  }

  const formData = Object.fromEntries(await request.formData())

  const result = updateWalletAddressSchema.safeParse(formData)

  if (!result.success) {
    actionResponse.errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ ...actionResponse }, { status: 400 })
  }

  const response = await updateWalletAddress(request, {
    ...result.data
  })

  if (!response?.walletAddress) {
    actionResponse.errors.message = [
      'Could not update the wallet address. Please try again!'
    ]
    return json({ ...actionResponse }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Wallet address was updated',
      type: 'success'
    },
    location: '.'
  })
}
