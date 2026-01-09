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
  useSubmit,
  Link
} from '@remix-run/react'
import { type ChangeEventHandler, type FormEvent, useRef, useState } from 'react'
import { z } from 'zod'
import { Box, Button, Card, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import { renderErrorPanel, renderFieldError } from '~/lib/form-errors'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { FeeType } from '~/generated/graphql'
import {
  getAssetInfo,
  updateAsset,
  setFee,
  deleteAsset
} from '~/lib/api/asset.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import {
  updateAssetSchema,
  setAssetFeeSchema,
  uuidSchema
} from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { formatAmount } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

type FormFieldProps = {
  name: string
  label: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'
  error?: string | string[]
  required?: boolean
  defaultValue?: string | number
  value?: string | number
  disabled?: boolean
  readOnly?: boolean
  onChange?: ChangeEventHandler<HTMLInputElement>
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
  readOnly,
  onChange
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
      onChange={onChange}
      size='3'
      className='w-full'
    />
    {renderFieldError(error)}
  </Flex>
)

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const assetId = params.assetId

  const result = z.string().uuid().safeParse(assetId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid asset ID.' })
  }

  const asset = await getAssetInfo(request, { id: result.data })

  if (!asset) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }

  return json({ asset })
}

export default function ViewAssetPage() {
  const { asset } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const navigation = useNavigation()
  const formAction = useFormAction()
  const submit = useSubmit()
  const dialogRef = useRef<ConfirmationDialogRef>(null)

  const isSubmitting = navigation.state === 'submitting'
  const currentPageAction = isSubmitting && navigation.formAction === formAction

  const [formData, setFormData] = useState<FormData>()
  const [basisPointsInput, setBasisPointsInput] = useState(
    asset.sendingFee?.basisPoints ?? undefined
  )

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
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Asset Details</Heading>

        <Card className='max-w-3xl'>
          <Flex direction='column'>
            <Flex direction='column' gap='4' pb='6'>
              <Flex align='center' justify='between' gap='3' wrap='wrap'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  General Information
                </Text>
                <Text size='2' color='gray'>
                  Created at {new Date(asset.createdAt).toLocaleString()}
                </Text>
              </Flex>
              {renderErrorPanel(response?.errors.general.message)}
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={currentPageAction}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={asset.id} />
                    <FormField label='Asset ID' name='assetId' value={asset.id} disabled readOnly />
                    <Flex gap='3' className='flex-1'>
                      <Box className='flex-1'>
                        <FormField label='Code' name='code' value={asset.code} disabled readOnly />
                      </Box>
                      <Box className='flex-1'>
                        <FormField
                          label='Scale'
                          name='scale'
                          value={asset.scale}
                          disabled
                          readOnly
                        />
                      </Box>
                      <Box className='flex-1'>
                        <FormField
                          type='number'
                          name='withdrawalThreshold'
                          label='Withdrawal Threshold'
                          defaultValue={asset.withdrawalThreshold ?? undefined}
                          error={response?.errors.general.fieldErrors.withdrawalThreshold}
                        />
                      </Box>
                    </Flex>
                  </Flex>
                  <Flex justify='end' mt='4'>
                    <Button
                      aria-label='save general information'
                      type='submit'
                      name='intent'
                      value='general'
                    >
                      {currentPageAction ? 'Saving ...' : 'Save'}
                    </Button>
                  </Flex>
                </fieldset>
              </Form>
            </Flex>
            <hr/>
            <Flex direction='column' gap='4' pt='6' pb='6'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Liquidity Information
              </Text>
              <Flex justify='between' align='center'>
                <Flex direction='column' gap='1'>
                  <Text weight='medium'>Amount</Text>
                  <Text size='2' color='gray'>
                    {formatAmount(asset.liquidity ?? '0', asset.scale)} {asset.code}
                  </Text>
                </Flex>
                <Flex gap='3'>
                  <Button asChild>
                    <Link
                      aria-label='deposit asset liquidity page'
                      preventScrollReset
                      to={`/assets/${asset.id}/deposit-liquidity`}
                    >
                      Deposit liquidity
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link
                      aria-label='withdraw asset liquidity page'
                      preventScrollReset
                      to={`/assets/${asset.id}/withdraw-liquidity`}
                    >
                      Withdraw liquidity
                    </Link>
                  </Button>
                </Flex>
              </Flex>
            </Flex>
            <hr/>
            <Flex direction='column' gap='4' pt='6'>
              <Flex direction='column' gap='2'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  Sending Fee
                </Text>
                {asset.sendingFee ? (
                  <Text size='2' color='gray'>
                    Created at {new Date(asset.sendingFee.createdAt).toLocaleString()}
                  </Text>
                ) : null}
              </Flex>
              {renderErrorPanel(response?.errors.sendingFee.message)}
              <Flex justify='end'>
                <Button asChild>
                  <Link
                    aria-label='view asset fees page'
                    to={`/assets/${asset.id}/fee-history`}
                  >
                    Fee history
                  </Link>
                </Button>
              </Flex>
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={currentPageAction}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='assetId' value={asset.id} />
                    <Flex gap='3' className='flex-1'>
                      <Box className='flex-1'>
                        <FormField
                          type='number'
                          name='fixed'
                          label='Fixed Fee'
                          defaultValue={asset.sendingFee?.fixed ?? undefined}
                          error={response?.errors.sendingFee.fieldErrors.fixed}
                        />
                      </Box>
                      <Box className='flex-1'>
                        <FormField
                          type='number'
                          name='basisPoints'
                          label='Basis Points'
                          error={response?.errors.sendingFee.fieldErrors.basisPoints}
                          value={basisPointsInput}
                          onChange={(e) =>
                            setBasisPointsInput(parseFloat(e?.target?.value))
                          }
                        />
                      </Box>
                    </Flex>
                    <Text size='2' color='gray'>
                      A single basis point is a fee equal to 0.01% of the total amount.
                      A fee of {basisPointsInput || 1} basis point on $100 is $
                      {((basisPointsInput || 1) * 0.01).toFixed(4)}.
                    </Text>
                  </Flex>
                  <Flex justify='end' mt='4'>
                    <Button
                      aria-label='save sending fee information'
                      type='submit'
                      name='intent'
                      value='sending-fees'
                    >
                      {currentPageAction ? 'Saving ...' : 'Save'}
                    </Button>
                  </Flex>
                </fieldset>
              </Form>
            </Flex>
          </Flex>
        </Card>

        <Flex justify='end' className='max-w-3xl'>
          <Form method='post' onSubmit={submitHandler}>
            <input type='hidden' name='id' value={asset.id} />
            <input type='hidden' name='intent' value='delete' />
            <Button type='submit' color='red' aria-label='delete asset'>
              Delete asset
            </Button>
          </Form>
        </Flex>

        <ConfirmationDialog
          ref={dialogRef}
          onConfirm={onConfirm}
          title={`Delete Asset ${asset.code}`}
          keyword={'delete asset'}
          confirmButtonText='Delete this asset'
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
        fieldErrors: ZodFieldErrors<typeof updateAssetSchema>
        message: string[]
      }
      sendingFee: {
        fieldErrors: ZodFieldErrors<typeof setAssetFeeSchema>
        message: string[]
      }
    }
  } = {
    errors: {
      general: {
        fieldErrors: {},
        message: []
      },
      sendingFee: {
        fieldErrors: {},
        message: []
      }
    }
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  switch (intent) {
    case 'general': {
      const result = updateAssetSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        actionResponse.errors.general.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const response = await updateAsset(request, {
        ...result.data,
        ...(result.data.withdrawalThreshold
          ? { withdrawalThreshold: result.data.withdrawalThreshold }
          : { withdrawalThreshold: undefined })
      })

      if (!response?.asset) {
        actionResponse.errors.general.message = [
          'Could not update asset. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      break
    }
    case 'sending-fees': {
      const result = setAssetFeeSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        actionResponse.errors.sendingFee.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const response = await setFee(request, {
        assetId: result.data.assetId,
        type: FeeType.Sending,
        fee: {
          fixed: result.data.fixed,
          basisPoints: result.data.basisPoints
        }
      })

      if (!response?.fee) {
        actionResponse.errors.sendingFee.message = [
          'Could not update asset sending fee. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      break
    }
    case 'delete': {
      const result = uuidSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        return setMessageAndRedirect({
          session,
          message: {
            content: 'Invalid asset ID.',
            type: 'error'
          },
          location: '.'
        })
      }

      const response = await deleteAsset(request, { id: result.data.id })
      if (!response?.asset) {
        return setMessageAndRedirect({
          session,
          message: {
            content: 'Could not delete Asset.',
            type: 'error'
          },
          location: '.'
        })
      }

      return setMessageAndRedirect({
        session,
        message: {
          content: 'Asset was deleted.',
          type: 'success'
        },
        location: '/assets'
      })
    }
    default:
      throw json(null, { status: 400, statusText: 'Invalid intent.' })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Asset information was updated',
      type: 'success'
    },
    location: '.'
  })
}
