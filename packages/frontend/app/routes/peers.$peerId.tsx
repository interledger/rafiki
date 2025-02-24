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
import { type FormEvent, useRef, useState } from 'react'
import { z } from 'zod'
import { DangerZone, PageHeader } from '~/components'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { Button, ErrorPanel, Input, PasswordInput } from '~/components/ui'
import { deletePeer, getPeer, updatePeer } from '~/lib/api/peer.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import {
  peerGeneralInfoSchema,
  peerHttpInfoSchema,
  uuidSchema
} from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { formatAmount } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const peerId = params.peerId

  const result = z.string().uuid().safeParse(peerId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid peer ID.' })
  }

  const peer = await getPeer(request, { id: result.data })
  if (!peer) {
    throw json(null, { status: 400, statusText: 'Peer not found.' })
  }

  return json({ peer })
}

export default function ViewPeerPage() {
  const { peer } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const formAction = useFormAction()
  const [formData, setFormData] = useState<FormData>()
  const submit = useSubmit()
  const navigation = useNavigation()
  const dialogRef = useRef<ConfirmationDialogRef>(null)

  const isSubmitting = navigation.state === 'submitting'
  const currentPageAction = isSubmitting && navigation.formAction === formAction

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
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>
              Created at {new Date(peer.createdAt).toLocaleString()}
            </p>
            <ErrorPanel errors={response?.errors.general.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={currentPageAction}>
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
                    description={
                      <>
                        The name of the{' '}
                        <a
                          className='default-link'
                          href='https://rafiki.dev/resources/glossary#peer'
                        >
                          peer
                        </a>
                        .
                      </>
                    }
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
                    description={
                      <>
                        {"The peer's "}
                        <a
                          className='default-link'
                          href='https://interledger.org/developers/rfcs/ilp-addresses/'
                        >
                          address on the Interledger network.
                        </a>
                      </>
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
                    description={
                      <>
                        The maximum amount of value that can be sent in a single{' '}
                        <a
                          className='default-link'
                          href='https://interledger.org/developers/rfcs/stream-protocol/#35-packets-and-frames'
                        >
                          Interledger STREAM Packet
                        </a>
                        .
                      </>
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
        {/* Peer General Info - END */}
        {/* Peer HTTP Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>HTTP Information</h3>
            <ErrorPanel errors={response?.errors.http.message} />
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <Form method='post' replace preventScrollReset>
              <fieldset disabled={currentPageAction}>
                <div className='w-full p-4 space-y-3'>
                  <Input type='hidden' name='id' value={peer.id} />
                  <Input
                    name='incomingAuthTokens'
                    label='Incoming Auth Tokens'
                    placeholder='Accepts a comma separated list of tokens'
                    error={response?.errors.http.fieldErrors.incomingAuthTokens}
                    description={
                      <>
                        List of valid tokens to accept when receiving incoming{' '}
                        <a
                          className='default-link'
                          href='https://rafiki.dev/integration/deployment/services/backend-service/#interledger-connector'
                        >
                          ILP packets
                        </a>{' '}
                        from the peer.
                      </>
                    }
                  />
                  <PasswordInput
                    name='outgoingAuthToken'
                    label='Outgoing Auth Token'
                    placeholder='Outgoing HTTP Auth Token'
                    required
                    defaultValue={peer.http.outgoing.authToken}
                    error={response?.errors.http.fieldErrors.outgoingAuthToken}
                    description={
                      <>
                        Valid auth token to present when sending outgoing{' '}
                        <a
                          className='default-link'
                          href='https://rafiki.dev/integration/deployment/services/backend-service/#interledger-connector'
                        >
                          ILP packets
                        </a>{' '}
                        to the peer.
                      </>
                    }
                  />
                  <Input
                    name='outgoingEndpoint'
                    label='Outgoing Endpoint'
                    placeholder='Outgoing HTTP Endpoint'
                    required
                    defaultValue={peer.http.outgoing.endpoint}
                    error={response?.errors.http.fieldErrors.outgoingEndpoint}
                    description={
                      <>
                        Endpoint on the peer to which outgoing ILP packets will
                        be sent.
                      </>
                    }
                  />
                </div>
                <div className='flex justify-end p-4'>
                  <Button
                    aria-label='save http information'
                    type='submit'
                    name='intent'
                    value='http'
                  >
                    {currentPageAction ? 'Saving ...' : 'Save'}
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
            <h3 className='text-lg font-medium'>Asset Information</h3>
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
        {/* Peer Liquidity Info */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Liquidity Information</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 flex justify-between items-center'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>
                  {formatAmount(peer.liquidity ?? '0', peer.asset.scale)}{' '}
                  {peer.asset.code}
                </p>
              </div>
              <div className='flex space-x-4'>
                <Button
                  aria-label='deposit peer liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/peers/${peer.id}/deposit-liquidity`}
                >
                  Deposit liquidity
                </Button>
                <Button
                  aria-label='withdraw peer liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/peers/${peer.id}/withdraw-liquidity`}
                >
                  Withdraw liquidity
                </Button>
              </div>
            </div>
          </div>
        </div>
        {/* Peer Liquidity Info - END */}
        {/* DELETE PEER - Danger zone */}
        <DangerZone title='Delete Peer'>
          <Form method='post' onSubmit={submitHandler}>
            <Input type='hidden' name='id' value={peer.id} />
            <Input type='hidden' name='intent' value='delete' />
            <Button type='submit' intent='danger' aria-label='delete peer'>
              Delete peer
            </Button>
          </Form>
        </DangerZone>
      </div>
      <ConfirmationDialog
        ref={dialogRef}
        onConfirm={onConfirm}
        title='Delete Peer'
        keyword={peer.name || 'delete peer'}
        confirmButtonText='Delete this peer'
      />
      <Outlet />
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
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

  const session = await messageStorage.getSession(request.headers.get('cookie'))
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

      const response = await updatePeer(request, {
        ...result.data,
        ...(result.data.maxPacketAmount
          ? { maxPacketAmount: result.data.maxPacketAmount }
          : { maxPacketAmount: undefined })
      })

      if (!response?.peer) {
        actionResponse.errors.general.message = [
          'Could not update peer. Please try again!'
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

      const response = await updatePeer(request, {
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

      if (!response?.peer) {
        actionResponse.errors.general.message = [
          'Could not update peer. Please try again!'
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
            content: 'Invalid peer ID.',
            type: 'error'
          },
          location: '.'
        })
      }

      const response = await deletePeer(request, {
        input: { id: result.data.id }
      })
      if (!response?.success) {
        return setMessageAndRedirect({
          session,
          message: {
            content: 'Could not delete peer.',
            type: 'error'
          },
          location: '.'
        })
      }

      return setMessageAndRedirect({
        session,
        message: {
          content: 'Peer was deleted.',
          type: 'success'
        },
        location: '/peers'
      })
    }
    default:
      throw json(null, { status: 400, statusText: 'Invalid intent.' })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Peer information was updated.',
      type: 'success'
    },
    location: '.'
  })
}
