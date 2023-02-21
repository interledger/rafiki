import {
  json,
  redirect,
  type ActionArgs,
  type LoaderArgs
} from '@remix-run/node'
import { assetService } from '~/services/bootstrap.server'
import { z } from 'zod'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import PageHeader from '~/components/PageHeader'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import ErrorPanel from '~/components/ui/ErrorPanel'
import type { ZodFieldErrors } from '~/shared/types'
import { updateAssetSchema } from '~/lib/validate.server'
import { commitSession, getSession, setMessage } from '~/lib/message.server'

export async function loader({ params }: LoaderArgs) {
  const assetId = params.assetId

  const result = z.string().uuid().safeParse(assetId)
  if (!result.success) {
    throw new Error('Invalid asset ID.')
  }

  const asset = await assetService.get({ id: result.data })

  if (!asset) {
    throw new Response(null, { status: 400, statusText: 'Asset not found.' })
  }

  return json({
    asset: {
      ...asset,
      createdAt: new Date(asset.createdAt).toLocaleString()
    }
  })
}

export default function ViewPeerPage() {
  const { asset } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

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
            <h3 className='text-lg font-medium'>General Informations</h3>
            <p className='text-sm'>Created at {asset.createdAt}</p>
            <ErrorPanel errors={response?.errors.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace>
              <fieldset disabled={isSubmitting}>
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
                    error={response?.errors.fieldErrors.withdrawalThreshold}
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button aria-label='save asset informations' type='submit'>
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const actionResponse: {
    errors: {
      fieldErrors: ZodFieldErrors<typeof updateAssetSchema>
      message: string[]
    }
  } = {
    errors: {
      fieldErrors: {},
      message: []
    }
  }

  const formData = Object.fromEntries(await request.formData())

  const result = updateAssetSchema.safeParse(formData)

  if (!result.success) {
    actionResponse.errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ ...actionResponse }, { status: 400 })
  }

  const response = await assetService.update({
    ...result.data,
    ...(result.data.withdrawalThreshold
      ? { withdrawalThreshold: result.data.withdrawalThreshold }
      : { withdrawalThreshold: undefined })
  })

  if (!response?.success) {
    actionResponse.errors.message = [
      response?.message ?? 'Could not update asset. Please try again!'
    ]
    return json({ ...actionResponse }, { status: 400 })
  }

  const session = await getSession(request.headers.get('cookie'))

  setMessage(session, {
    content: 'Asset informations were updated.',
    type: 'success'
  })

  return redirect('.', {
    headers: { 'Set-Cookie': await commitSession(session) }
  })
}
