import { Dialog } from '@headlessui/react'
import { type ActionArgs, json, redirect } from '@remix-run/node'
import {
  Form,
  useActionData,
  useNavigate,
  useNavigation,
  useParams
} from '@remix-run/react'
import { v4 } from 'uuid'
import { XIcon } from '~/components/icons'
import { Button, Input } from '~/components/ui'
import { addPeerLiquidity } from '~/lib/api/peer.server'
import { messageStorage } from '~/lib/message.server'
import { addPeerLiquiditySchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'

export default function PeerAddLiquidity() {
  const { peerId } = useParams()
  const response = useActionData<typeof action>()
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
                Add peer liquidity
              </Dialog.Title>
              <div className='mt-2'>
                <Form method='post' replace>
                  <fieldset disabled={isSubmitting}>
                    <input type='hidden' name='peerId' value={peerId} />
                    <Input
                      required
                      type='number'
                      name='amount'
                      label='Amount'
                      error={response?.errors.fieldErrors.amount}
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

export async function action({ request }: ActionArgs) {
  const actionResponse: {
    errors: {
      fieldErrors: ZodFieldErrors<typeof addPeerLiquiditySchema>
      message: string[]
    }
  } = {
    errors: {
      fieldErrors: {},
      message: []
    }
  }

  const formData = Object.fromEntries(await request.formData())

  const result = addPeerLiquiditySchema.safeParse(formData)

  if (!result.success) {
    actionResponse.errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ ...actionResponse }, { status: 400 })
  }

  const response = await addPeerLiquidity({
    ...result.data,
    id: v4(),
    idempotencyKey: v4()
  })

  if (!response?.success) {
    actionResponse.errors.message = [
      response?.message ?? 'Could not add peer liquidity. Please try again!'
    ]
    return json({ ...actionResponse }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  session.flash('message', {
    content: response.message,
    type: 'success'
  })

  return redirect('.', {
    headers: { 'Set-Cookie': await messageStorage.commitSession(session) }
  })
}
