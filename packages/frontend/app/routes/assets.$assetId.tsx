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
import { Button, ErrorPanel, Input } from '~/components/ui'
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
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader className='!justify-end'>
          <Button aria-label='go back to assets page' to='/assets'>
            Go to assets page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>
              Created at {new Date(asset.createdAt).toLocaleString()}
            </p>
            <ErrorPanel errors={response?.errors.general.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={currentPageAction}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={asset.id} />
                  <Input label='Asset ID' value={asset.id} disabled readOnly />
                  <Input label='Code' value={asset.code} disabled readOnly />
                  <Input label='Scale' value={asset.scale} disabled readOnly />
                  <Input
                    type='number'
                    name='withdrawalThreshold'
                    label='Withdrawal Threshold'
                    defaultValue={asset.withdrawalThreshold ?? undefined}
                    error={
                      response?.errors.general.fieldErrors.withdrawalThreshold
                    }
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button
                    aria-label='save general information'
                    type='submit'
                    name='intent'
                    value='general'
                  >
                    {currentPageAction ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Asset Liquidity Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Liquidity Information</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 flex justify-between items-center'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>
                  {formatAmount(asset.liquidity ?? '0', asset.scale)}{' '}
                  {asset.code}
                </p>
              </div>
              <div className='flex space-x-4'>
                <Button
                  aria-label='deposit asset liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/assets/${asset.id}/deposit-liquidity`}
                >
                  Deposit liquidity
                </Button>
                <Button
                  aria-label='withdraw asset liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/assets/${asset.id}/withdraw-liquidity`}
                >
                  Withdraw liquidity
                </Button>
              </div>
            </div>
          </div>
        </div>
        {/* Asset Liquidity Info - END */}
        {/* Asset Fee Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Sending Fee</h3>
            {asset.sendingFee ? (
              <p className='text-sm'>
                Created at{' '}
                {new Date(asset.sendingFee.createdAt).toLocaleString()}
              </p>
            ) : null}
            <ErrorPanel errors={response?.errors.sendingFee.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='flex justify-end p-4'>
              <Button
                aria-label='view asset fees page'
                type='button'
                to={`/assets/${asset.id}/fee-history`}
              >
                Fee history
              </Button>
            </div>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={currentPageAction}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='assetId' value={asset.id} />
                  <Input
                    type='number'
                    name='fixed'
                    label='Fixed Fee'
                    defaultValue={asset.sendingFee?.fixed ?? undefined}
                    error={response?.errors.sendingFee.fieldErrors.fixed}
                  />
                  <Input
                    type='number'
                    name='basisPoints'
                    label='Basis Points'
                    error={response?.errors.sendingFee.fieldErrors.basisPoints}
                    value={basisPointsInput}
                    onChange={(e) =>
                      setBasisPointsInput(parseFloat(e?.target?.value))
                    }
                  />
                  <p className='text-gray-500 text-sm mt-2'>
                    A single basis point is a fee equal to 0.01% of the total
                    amount. A fee of {basisPointsInput || 1} basis point on $100
                    is ${((basisPointsInput || 1) * 0.01).toFixed(4)}.
                  </p>
                  <div className='flex justify-end p-4'>
                    <Button
                      aria-label='save sending fee information'
                      type='submit'
                      name='intent'
                      value='sending-fees'
                    >
                      {currentPageAction ? 'Saving ...' : 'Save'}
                    </Button>
                  </div>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Asset Fee Info - END */}

        {/* DELETE ASSET - Danger zone */}
        <DangerZone title='Delete Asset'>
          <Form method='post' onSubmit={submitHandler}>
            <Input type='hidden' name='id' value={asset.id} />
            <Input type='hidden' name='intent' value='delete' />
            <Button type='submit' intent='danger' aria-label='delete asset'>
              Delete asset
            </Button>
          </Form>
        </DangerZone>
      </div>
      <ConfirmationDialog
        ref={dialogRef}
        onConfirm={onConfirm}
        title={`Delete Asset ${asset.code}`}
        keyword={'delete asset'}
        confirmButtonText='Delete this asset'
      />
      <Outlet />
    </div>
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
