/* eslint-disable no-case-declarations */
import {
  json,
  redirect,
  type ActionArgs,
  type LoaderArgs
} from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { z } from 'zod'
import { DangerZone } from '~/components/DangerZone'
import PageHeader from '~/components/PageHeader'
import { Button } from '~/components/ui/Button'
import ErrorPanel from '~/components/ui/ErrorPanel'
import { Input } from '~/components/ui/Input'
import { PasswordInput } from '~/components/ui/PasswordInput'
import { deletePeer, getPeer, updatePeer } from '~/lib/api/peer.server'
import { commitSession, getSession, setMessage } from '~/lib/message.server'
import {
  peerGeneralInfoSchema,
  peerHttpInfoSchema,
  uuidSchema
} from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'

export async function loader({ params }: LoaderArgs) {
  const peerId = params.peerId

  const result = z.string().uuid().safeParse(peerId)
  if (!result.success) {
    throw new Error('Invalid peer ID.')
  }

  const peer = await getPeer({ id: result.data })

  if (!peer) {
    throw new Response(null, { status: 400, statusText: 'Peer not found.' })
  }

  return json({
    peer: {
      ...peer,
      createdAt: new Date(peer.createdAt).toLocaleString()
    }
  })
}

export default function ViewPeerPage() {
  const { peer } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()

  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        {/* Peer General Info */}
        <PageHeader>
          <div>
            {peer.name ? (
              <h4>
                Name:{' '}
                <span className='text-sm sm:text-base font-semibold'>
                  {peer.name}
                </span>
              </h4>
            ) : null}
          </div>
          <Button aria-label='go back to peers page' to='/peers'>
            Go to peers page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          {/* Peer General Info*/}
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Informations</h3>
            <p className='text-sm'>Created at {peer.createdAt}</p>
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
                    type='number'
                    name='maxPacketAmount'
                    defaultValue={
                      peer.maxPacketAmount ? peer.maxPacketAmount : ''
                    }
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
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>HTTP Informations</h3>
            <ErrorPanel errors={response?.errors.http.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace>
              <fieldset disabled={isSubmitting}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={peer.id} />
                  <Input
                    name='incomingAuthTokens'
                    label='Incoming Auth Tokens'
                    placeholder='Accepts a comma separated list of tokens'
                    error={response?.errors.http.fieldErrors.incomingAuthTokens}
                  />
                  <PasswordInput
                    name='outgoingAuthToken'
                    label='Outgoing Auth Token'
                    placeholder='Outgoing HTTP Auth Token'
                    required
                    defaultValue={peer.http.outgoing.authToken}
                    error={response?.errors.http.fieldErrors.outgoingAuthToken}
                  />
                  <Input
                    name='outgoingEndpoint'
                    label='Outgoing Endpoint'
                    placeholder='Outgoing HTTP Endpoint'
                    required
                    defaultValue={peer.http.outgoing.endpoint}
                    error={response?.errors.http.fieldErrors.outgoingEndpoint}
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button
                    aria-label='save http informations'
                    type='submit'
                    name='intent'
                    value='http'
                  >
                    {isSubmitting ? 'Saving ...' : 'Save'}
                  </Button>
                </div>
              </fieldset>
            </Form>
          </div>
        </div>
        {/* Peer HTTP Info - END */}
        {/* Peer Asset Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Asset Informations</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Code</p>
                <p className='mt-1'>{peer.asset.code}</p>
              </div>
              <div>
                <p className='font-medium'>Scale</p>
                <p className='mt-1'>{peer.asset.scale}</p>
              </div>
              <div>
                <p className='font-medium'>Withdrawal threshold</p>
                <p className='mt-1'>
                  {peer.asset.withdrawalThreshold ?? 'No withdrawal threshhold'}
                </p>
              </div>
            </div>
            <div className='flex justify-end p-4'>
              <Button
                aria-label='go to asset page'
                type='button'
                to={`/assets/${peer.asset.id}`}
              >
                View asset
              </Button>
            </div>
          </div>
        </div>
        {/* Peer Asset Info - END */}
        {/* DELETE PEER - Danger zone */}
        <DangerZone title='Delete Peer'>
          <Form method='post'>
            <Input type='hidden' name='id' value={peer.id} />
            <Button
              type='submit'
              intent='danger'
              name='intent'
              value='delete'
              aria-label='delete peer'
            >
              Delete peer
            </Button>
          </Form>
        </DangerZone>
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const actionResponse: {
    errors: {
      general: {
        fieldErrors: ZodFieldErrors<typeof peerGeneralInfoSchema>
        message: string[]
      }
      http: {
        fieldErrors: ZodFieldErrors<typeof peerHttpInfoSchema>
        message: string[]
      }
    }
  } = {
    errors: {
      general: {
        fieldErrors: {},
        message: []
      },
      http: {
        fieldErrors: {},
        message: []
      }
    }
  }

  const session = await getSession(request.headers.get('cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  switch (intent) {
    case 'general': {
      const result = peerGeneralInfoSchema.safeParse(
        Object.fromEntries(formData)
      )

      if (!result.success) {
        actionResponse.errors.general.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const response = await updatePeer({
        ...result.data,
        ...(result.data.maxPacketAmount
          ? { maxPacketAmount: result.data.maxPacketAmount }
          : { maxPacketAmount: undefined })
      })

      if (!response?.success) {
        actionResponse.errors.general.message = [
          response?.message ?? 'Could not update peer. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      break
    }
    case 'http': {
      const result = peerHttpInfoSchema.safeParse(Object.fromEntries(formData))

      if (!result.success) {
        actionResponse.errors.http.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const response = await updatePeer({
        id: result.data.id,
        http: {
          ...(result.data.incomingAuthTokens
            ? {
                incoming: {
                  authTokens: result.data.incomingAuthTokens
                    ?.replace(/ /g, '')
                    .split(',')
                }
              }
            : {}),
          outgoing: {
            endpoint: result.data.outgoingEndpoint,
            authToken: result.data.outgoingAuthToken
          }
        }
      })

      if (!response?.success) {
        actionResponse.errors.general.message = [
          response?.message ?? 'Could not update peer. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      break
    }
    case 'delete': {
      const result = uuidSchema.safeParse(Object.fromEntries(formData))
      if (!result.success) {
        setMessage(session, {
          content: 'Invalid peer ID.',
          type: 'error'
        })

        return redirect('.', {
          headers: { 'Set-Cookie': await commitSession(session) }
        })
      }

      const response = await deletePeer(result.data)
      if (!response?.success) {
        setMessage(session, {
          content: 'Could not delete peer.',
          type: 'error'
        })

        return redirect('.', {
          headers: { 'Set-Cookie': await commitSession(session) }
        })
      }

      setMessage(session, {
        content: 'Peer was deleted.',
        type: 'success'
      })

      return redirect('/peers', {
        headers: { 'Set-Cookie': await commitSession(session) }
      })
      break
    }
    default:
      throw new Error('Invalid intent.')
  }

  setMessage(session, {
    content: 'Peer informations were updated.',
    type: 'success'
  })

  return redirect('.', {
    headers: { 'Set-Cookie': await commitSession(session) }
  })
}
