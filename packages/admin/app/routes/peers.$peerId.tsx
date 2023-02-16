/* eslint-disable no-case-declarations */
import { type ActionArgs, type LoaderArgs, redirect } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation
} from '@remix-run/react'
import { z } from 'zod'
import { Button } from '~/components/ui/Button'
import ErrorPanel from '~/components/ui/ErrorPanel'
import { Input } from '~/components/ui/Input'
import { commitSession, getSession, setMessage } from '~/lib/message.server'
import { peerGeneralInfoSchema } from '~/lib/validate.server'
import { peerService } from '~/services/bootstrap.server'
import type { ZodFieldErrors } from '~/shared/types'
import { obscureAuthToken } from '../lib/utils.server'

export async function loader({ params }: LoaderArgs) {
  const peerId = params.peerId

  const result = z.string().uuid().safeParse(peerId)
  if (!result.success) {
    throw new Error('Invalid peer ID.')
  }

  const peer = await peerService.get({ id: result.data })

  if (!peer) {
    throw new Error('Peer not found')
  }

  peer.http.outgoing.authToken = obscureAuthToken(peer?.http.outgoing.authToken)

  return json({ peer })
}

export default function ViewPeerPage() {
  const { peer } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const navigate = useNavigate()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      {/* Page Header */}
      <div className='flex p-4 bg-offwhite rounded-md items-center justify-between space-x-5'>
        <h3 className='text-xl'>Create Peer</h3>
        <Button
          aria-label='go back to peers page'
          onClick={() => navigate('/peers')}
        >
          Go to peers page
        </Button>
      </div>
      {/* Page Header - END */}
      <div className='flex flex-col rounded-md bg-offwhite'>
        {/* Peer General Info */}
        <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Informations</h3>
            <ErrorPanel errors={response?.errors.general.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={peer.id} />
                  <Input
                    label='Peer ID'
                    value={peer.id}
                    placeholder='Peer ID'
                    disabled
                    readOnly
                  />
                  <Input
                    name='name'
                    label='Name'
                    defaultValue={peer.name ?? ''}
                    placeholder='Peer name'
                    error={response?.errors.general.fieldErrors.name}
                  />
                  <Input
                    name='staticIlpAddress'
                    label='Static ILP Address'
                    defaultValue={peer.staticIlpAddress}
                    placeholder='ILP Address'
                    required
                    error={
                      response?.errors.general.fieldErrors.staticIlpAddress
                    }
                  />
                  <Input
                    name='maxPacketAmount'
                    defaultValue={String(peer.maxPacketAmount)}
                    label='Max Packet Amount'
                    placeholder='Max Packet Amount'
                    error={response?.errors.general.fieldErrors.maxPacketAmount}
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button
                    aria-label='save general informations'
                    type='submit'
                    name='intent'
                    value='general'
                  >
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Peer General Info - END */}
        {/* Peer HTTP Info */}
        <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>HTTP Informations</h3>
            <ErrorPanel errors={undefined} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='incomingAuthTokens'
                    label='Incoming Auth Tokens'
                    placeholder='Accepts a comma separated list of tokens'
                  />
                  <Input
                    name='outgoingAuthToken'
                    label='Outgoing Auth Token'
                    placeholder='Outgoing HTTP Auth Token'
                    required
                  />
                  <Input
                    name='outgoingEndpoint'
                    label='Outgoing Endpoint'
                    placeholder='Outgoing HTTP Endpoint'
                    required
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button aria-label='save general informations' type='submit'>
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Peer HTTP Info - END */}
        {/* Peer HTTP Info */}
        <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>HTTP Informations</h3>
            <ErrorPanel errors={['messsage']} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='asset'
                    label='Asset'
                    placeholder='Asset ID'
                    required
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button aria-label='save general informations' type='submit'>
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Peer HTTP Info - END */}
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const actionResponse: {
    success: boolean
    errors: {
      general: {
        fieldErrors: ZodFieldErrors<typeof peerGeneralInfoSchema>
        message: string[]
      }
    }
  } = {
    success: true,
    errors: {
      general: {
        fieldErrors: {},
        message: []
      }
    }
  }

  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  switch (intent) {
    case 'general':
      const result = peerGeneralInfoSchema.safeParse(
        Object.fromEntries(formData)
      )

      if (!result.success) {
        actionResponse.success = false
        actionResponse.errors.general.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const response = await peerService.update({
        id: result.data.id,
        name: result.data.name,
        staticIlpAddress: result.data.staticIlpAddress,
        ...(result.data.maxPacketAmount
          ? { maxPacketAmount: Number(result.data.maxPacketAmount) }
          : {})
      })

      if (!response?.success) {
        actionResponse.success = false
        actionResponse.errors.general.message = [
          response?.message ?? 'Could not update peer. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      break
    default:
      throw new Error('Invalid intent.')
  }

  const session = await getSession(request.headers.get('cookie'))

  setMessage(session, {
    content: 'Peer informations were updated',
    type: 'success'
  })

  return redirect('.', {
    headers: { 'Set-Cookie': await commitSession(session) }
  })
}
