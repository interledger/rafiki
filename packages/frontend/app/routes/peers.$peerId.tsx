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
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { z } from 'zod'
import { DangerZone } from '~/components'
import {
  ConfirmationDialog,
  type ConfirmationDialogRef
} from '~/components/ConfirmationDialog'
import { Box, Button, Card, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import { ErrorPanel, FieldError } from '~/components/ui'
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
  description?: ReactNode
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
  description
}: FormFieldProps) => (
  <Flex direction='column' gap='1'>
    <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
      <label htmlFor={name}>
        {label}
        {required ? <span className='text-vermillion'> *</span> : null}
      </label>
    </Text>
    {description ? (
      <Text size='2' color='gray'>
        {description}
      </Text>
    ) : null}
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
      className='w-full mt-1'
    />
    <FieldError error={error} />
  </Flex>
)

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
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Peer Details</Heading>
        {peer.name ? (
          <Text size='2' color='gray'>
            Name: {peer.name}
          </Text>
        ) : null}

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='5'>
            <Flex direction='column' gap='4'>
              <Flex align='center' justify='between' gap='3' wrap='wrap'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  General Information
                </Text>
                <Text size='2' color='gray'>
                  Created at {new Date(peer.createdAt).toLocaleString()}
                </Text>
              </Flex>
              <ErrorPanel errors={response?.errors.general.message} />
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={currentPageAction}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={peer.id} />
                    <FormField
                      label='Peer ID'
                      name='peerId'
                      value={peer.id}
                      disabled
                      readOnly
                    />
                    <FormField
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
                    <FormField
                      name='staticIlpAddress'
                      label='Static ILP Address'
                      defaultValue={peer.staticIlpAddress}
                      placeholder='ILP Address'
                      required
                      error={response?.errors.general.fieldErrors.staticIlpAddress}
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
                    <FormField
                      type='number'
                      name='maxPacketAmount'
                      defaultValue={peer.maxPacketAmount ? peer.maxPacketAmount : ''}
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

            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                HTTP Information
              </Text>
              <ErrorPanel errors={response?.errors.http.message} />
              <Form method='post' replace preventScrollReset>
                <fieldset disabled={currentPageAction}>
                  <Flex direction='column' gap='4'>
                    <input type='hidden' name='id' value={peer.id} />
                    <FormField
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
                    <FormField
                      name='outgoingAuthToken'
                      label='Outgoing Auth Token'
                      placeholder='Outgoing HTTP Auth Token'
                      required
                      type='password'
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
                    <FormField
                      name='outgoingEndpoint'
                      label='Outgoing Endpoint'
                      placeholder='Outgoing HTTP Endpoint'
                      required
                      defaultValue={peer.http.outgoing.endpoint}
                      error={response?.errors.http.fieldErrors.outgoingEndpoint}
                      description={
                        <>Endpoint on the peer to which outgoing ILP packets will be sent.</>
                      }
                    />
                  </Flex>
                  <Flex justify='end' mt='4'>
                    <Button
                      aria-label='save http information'
                      type='submit'
                      name='intent'
                      value='http'
                    >
                      {currentPageAction ? 'Saving ...' : 'Save'}
                    </Button>
                  </Flex>
                </fieldset>
              </Form>
            </Flex>

            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Asset Information
              </Text>
              <Flex gap='6' wrap='wrap'>
                <Box>
                  <Text weight='medium'>Code</Text>
                  <Text size='2' color='gray'>
                    {peer.asset.code}
                  </Text>
                </Box>
                <Box>
                  <Text weight='medium'>Scale</Text>
                  <Text size='2' color='gray'>
                    {peer.asset.scale}
                  </Text>
                </Box>
                <Box>
                  <Text weight='medium'>Withdrawal threshold</Text>
                  <Text size='2' color='gray'>
                    {peer.asset.withdrawalThreshold ?? 'No withdrawal threshold'}
                  </Text>
                </Box>
              </Flex>
              <Flex justify='end'>
                <Button asChild>
                  <Link aria-label='go to asset page' to={`/assets/${peer.asset.id}`}>
                    View asset
                  </Link>
                </Button>
              </Flex>
            </Flex>

            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Liquidity Information
              </Text>
              <Flex justify='between' align='center'>
                <Box>
                  <Text weight='medium'>Amount</Text>
                  <Text size='2' color='gray'>
                    {formatAmount(peer.liquidity ?? '0', peer.asset.scale)} {peer.asset.code}
                  </Text>
                </Box>
                <Flex gap='3'>
                  <Button asChild>
                    <Link
                      aria-label='deposit peer liquidity page'
                      preventScrollReset
                      to={`/peers/${peer.id}/deposit-liquidity`}
                    >
                      Deposit liquidity
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link
                      aria-label='withdraw peer liquidity page'
                      preventScrollReset
                      to={`/peers/${peer.id}/withdraw-liquidity`}
                    >
                      Withdraw liquidity
                    </Link>
                  </Button>
                </Flex>
              </Flex>
            </Flex>

            <DangerZone title='Delete Peer'>
              <Form method='post' onSubmit={submitHandler}>
                <input type='hidden' name='id' value={peer.id} />
                <input type='hidden' name='intent' value='delete' />
                <Button type='submit' color='red' aria-label='delete peer'>
                  Delete peer
                </Button>
              </Form>
            </DangerZone>
          </Flex>
        </Card>

        <ConfirmationDialog
          ref={dialogRef}
          onConfirm={onConfirm}
          title='Delete Peer'
          keyword={peer.name || 'delete peer'}
          confirmButtonText='Delete this peer'
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
