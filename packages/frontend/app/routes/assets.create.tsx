import { json, redirect, type ActionArgs } from '@remix-run/node'
import { Form, useActionData, useNavigation } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input } from '~/components/ui'
import { createAsset } from '~/lib/api/asset.server'
import { commitSession, getSession, setMessage } from '~/lib/message.server'
import { createAssetSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'

export default function CreateAssetPage() {
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Asset</h3>
          <Button aria-label='go back to assets page' to='/assets'>
            Go to assets page
          </Button>
        </PageHeader>
        {/* Create Asset form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>

          <fieldset disabled={isSubmitting}>
            {/* Asset General Info */}
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    required
                    name='code'
                    label='Code'
                    placeholder='Code'
                    error={response?.errors?.fieldErrors.code}
                  />
                  <Input
                    required
                    name='scale'
                    label='Scale'
                    placeholder='Scale'
                    error={response?.errors?.fieldErrors.scale}
                  />
                  <Input
                    type='number'
                    name='withdrawalThreshold'
                    label='Withdrawal Threshold'
                    error={response?.errors.fieldErrors.withdrawalThreshold}
                  />
                </div>
              </div>
            </div>
            <div className='flex justify-end py-3'>
              <Button aria-label='create asset' type='submit'>
                {isSubmitting ? 'Creating asset ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
        {/* Create Asset form - END */}
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createAssetSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = createAssetSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const response = await createAsset({
    ...result.data,
    ...(result.data.withdrawalThreshold
      ? { withdrawalThreshold: result.data.withdrawalThreshold }
      : { withdrawalThreshold: undefined })
  })

  if (!response?.success) {
    errors.message = [
      response?.message ?? 'Could not create asset. Please try again!'
    ]
    return json({ errors }, { status: 400 })
  }

  const session = await getSession(request.headers.get('cookie'))

  setMessage(session, {
    content: 'Asset created.',
    type: 'success'
  })

  return redirect(`/assets/${response.asset?.id}`, {
    headers: { 'Set-Cookie': await commitSession(session) }
  })
}
