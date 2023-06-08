import { Dialog } from '@headlessui/react'
import { type ActionArgs } from '@remix-run/node'
import { Form, useNavigate, useNavigation } from '@remix-run/react'
import { v4 } from 'uuid'
import { XIcon } from '~/components/icons'
import { Button, Input } from '~/components/ui'
import { addAssetLiquidity } from '~/lib/api/asset.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'

export default function PeerAddLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })
  const { state } = useNavigation()

  const isSubmitting = state === 'submitting'

  return (
    <Dialog
      as='div'
      className='relative z-10'
      onClose={dismissDialog}
      open={true}
    >
      <div className='fixed inset-0 bg-tealish/30 bg-opacity-75 transition-opacity' />
      <div className='fixed inset-0 z-10 overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4 text-center'>
          <Dialog.Panel className='relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-lg'>
            <div className='absolute right-0 top-0 pr-4 pt-4'>
              <button
                type='button'
                className='text-gray-400 hover:text-gray-500 focus:outline-none'
                onClick={dismissDialog}
              >
                <span className='sr-only'>Close</span>
                <XIcon className='h-8 w-8' aria-hidden='true' />
              </button>
            </div>
            <div>
              <Dialog.Title
                as='h3'
                className='font-semibold leading-6 text-lg text-center'
              >
                Add asset liquidity
              </Dialog.Title>
              <div className='mt-2'>
                <Form method='post' replace preventScrollReset>
                  <fieldset disabled={isSubmitting}>
                    <Input
                      required
                      type='number'
                      name='amount'
                      label='Amount'
                    />
                    <div className='flex justify-end py-3'>
                      <Button aria-label='add peer liquidity' type='submit'>
                        {isSubmitting
                          ? 'Adding liquidity ...'
                          : 'Add liquidity'}
                      </Button>
                    </div>
                  </fieldset>
                </Form>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  )
}

export async function action({ request, params }: ActionArgs) {
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const assetId = params.assetId

  if (!assetId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing asset ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const formData = await request.formData()
  const result = amountSchema.safeParse(formData.get('amount'))

  if (!result.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Amount is not valid. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  const response = await addAssetLiquidity({
    assetId,
    amount: result.data,
    id: v4(),
    idempotencyKey: v4()
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          response?.message ??
          'Could not add asset liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: response.message,
      type: 'success'
    },
    location: '..'
  })
}
