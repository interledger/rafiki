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
  Link
} from '@remix-run/react'
import { z } from 'zod'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
  Select
} from '@radix-ui/themes'
import { ErrorPanel, FieldError } from '~/components/ui'
import {
  getWalletAddress,
  updateWalletAddress
} from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { updateWalletAddressSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { capitalize, formatAmount } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

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
    <Text
      asChild
      size='2'
      weight='medium'
      className='tracking-wide text-gray-700'
    >
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
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Wallet Address Details</Heading>

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='5'>
            <Flex direction='column' gap='4'>
              <Flex align='center' justify='between' gap='3' wrap='wrap'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  General Information
                </Text>
                <Text size='2' color='gray'>
                  Created at{' '}
                  {new Date(walletAddress.createdAt).toLocaleString()}
                </Text>
              </Flex>
              <ErrorPanel errors={response?.errors.message} />
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={isSubmitting}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={walletAddress.id} />
                    <FormField
                      label='ID'
                      name='walletAddressId'
                      value={walletAddress.id}
                      disabled
                      readOnly
                    />
                    <FormField
                      label='URL'
                      name='address'
                      value={walletAddress.address}
                      disabled
                      readOnly
                    />
                    <FormField
                      name='publicName'
                      label='Public name'
                      defaultValue={walletAddress.publicName ?? undefined}
                      error={response?.errors.fieldErrors.publicName}
                    />
                    <Flex direction='column' gap='2'>
                      <Text
                        asChild
                        size='2'
                        weight='medium'
                        className='tracking-wide text-gray-700'
                      >
                        <label htmlFor='status'>
                          Status
                          <span className='text-vermillion'> *</span>
                        </label>
                      </Text>
                      <Select.Root
                        name='status'
                        defaultValue={walletAddress.status}
                        required
                      >
                        <Select.Trigger placeholder='Select status...' />
                        <Select.Content>
                          <Select.Item value='ACTIVE'>Active</Select.Item>
                          <Select.Item value='INACTIVE'>Inactive</Select.Item>
                        </Select.Content>
                      </Select.Root>
                      <FieldError error={response?.errors.fieldErrors.status} />
                    </Flex>
                  </Flex>
                  <Flex justify='end' mt='4'>
                    <Button
                      aria-label='save wallet address information'
                      type='submit'
                    >
                      {isSubmitting ? 'Saving ...' : 'Save'}
                    </Button>
                  </Flex>
                </fieldset>
              </Form>
            </Flex>
            <hr />
            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Asset Information
              </Text>
              <Flex gap='6' wrap='wrap'>
                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Code
                  </Text>
                  <Text size='2' color='gray'>
                    {walletAddress.asset.code}
                  </Text>
                </Flex>
                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Scale
                  </Text>
                  <Text size='2' color='gray'>
                    {walletAddress.asset.scale}
                  </Text>
                </Flex>
                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Withdrawal threshold
                  </Text>
                  <Text size='2' color='gray'>
                    {walletAddress.asset.withdrawalThreshold ??
                      'No withdrawal threshold'}
                  </Text>
                </Flex>
              </Flex>
              <Flex justify='end'>
                <Button asChild>
                  <Link
                    aria-label='go to asset page'
                    to={`/assets/${walletAddress.asset.id}`}
                  >
                    View asset
                  </Link>
                </Button>
              </Flex>
            </Flex>
            <hr />
            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Liquidity Information
              </Text>
              <Flex justify='between' align='center'>
                <Flex direction='column' gap='1'>
                  <Text weight='medium'>Amount</Text>
                  <Text size='2' color='gray'>
                    {displayLiquidityAmount}
                  </Text>
                </Flex>
                <Flex gap='3'>
                  {BigInt(walletAddress.liquidity ?? '0') ? (
                    <Button asChild>
                      <Link
                        aria-label='withdraw wallet address liquidity page'
                        preventScrollReset
                        to={`/wallet-addresses/${walletAddress.id}/withdraw-liquidity`}
                      >
                        Withdraw
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={true}
                      aria-label='withdraw wallet address liquidity page'
                    >
                      Withdraw
                    </Button>
                  )}
                </Flex>
              </Flex>
            </Flex>
            <hr />
in             <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Payments
              </Text>
              <Text size='2' color='gray'>
                View the payments involving this wallet address on the payments
                page.
              </Text>
              <Flex justify='end'>
                <Button asChild>
                  <Link
                    aria-label='go to payments page'
                    to={`/payments?walletAddressId=${walletAddress.id}`}
                  >
                    Go to payments page
                  </Link>
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </Card>
      </Flex>
      <Outlet context={displayLiquidityAmount} />
    </Box>
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
