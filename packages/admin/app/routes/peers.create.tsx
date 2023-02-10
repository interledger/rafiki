import { json, redirect, type ActionArgs } from '@remix-run/node'
import {
  Form,
  useActionData,
  useNavigate,
  useNavigation
} from '@remix-run/react'
import { Chevron } from '~/components/icons/Chevron'
import { Button } from '~/components/ui/Button'
import ErrorPanel from '~/components/ui/ErrorPanel'
import { Input } from '~/components/ui/Input'
import { peerService } from '~/services/bootstrap.server'
import { createPeerSchema } from '~/lib/validate.server'
import { z } from 'zod'
import type { JSONError } from '~/shared/types'

export default function CreatePeerPage() {
  const response = useActionData<typeof action>()
  const navigate = useNavigate()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      {/* Page Header */}
      <div className='flex p-4 bg-offwhite rounded-md items-center space-x-5'>
        <Button aria-label='go back to peers page' onClick={() => navigate(-1)}>
          <Chevron direction='left' className='w-6 h-6' />
        </Button>
        <h3 className='text-2xl'>Create Peer</h3>
      </div>
      {/* Page Header - END */}
      <div className='flex flex-col rounded-md bg-offwhite'>
        {/* Create Peer form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.formErrors} />
          </div>

          <fieldset disabled={isSubmitting}>
            {/* Peer General Info */}
            <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full max-w-lg p-4 space-y-3'>
                  <Input
                    name='name'
                    label='Name'
                    placeholder='Peer name'
                    error={response?.errors?.fieldErrors.name}
                  />
                  <Input
                    name='staticIlpAddress'
                    label='Static ILP Address'
                    placeholder='ILP Address'
                    required
                    error={response?.errors?.fieldErrors?.staticIlpAddress}
                  />
                  <Input
                    name='maxPacketAmount'
                    label='Max Packet Amount'
                    placeholder='Max Packet Amount'
                    error={response?.errors?.fieldErrors?.maxPacketAmount}
                  />
                </div>
              </div>
            </div>
            {/* Peer General Info - END */}
            {/* Peer HTTP Info */}
            <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>HTTP Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full max-w-lg p-4 space-y-3'>
                  <Input
                    name='incomingAuthTokens'
                    label='Incoming Auth Tokens'
                    placeholder='Accepts a comma separated list of tokens'
                    error={response?.errors?.fieldErrors?.incomingAuthTokens}
                  />
                  <Input
                    name='outgoingAuthToken'
                    label='Outgoing Auth Token'
                    placeholder='Outgoing HTTP Auth Token'
                    required
                    error={response?.errors?.fieldErrors?.outgoingAuthToken}
                  />
                  <Input
                    name='outgoingEndpoint'
                    label='Outgoing Endpoint'
                    placeholder='Outgoing HTTP Endpoint'
                    required
                    error={response?.errors?.fieldErrors?.outgoingEndpoint}
                  />
                </div>
              </div>
            </div>
            {/* Peer Asset */}
            <div className='grid grid-cols-1 px-6 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Asset Informations</h3>
                <p className='text-sm italic'>(TODO: dropdown)</p>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full max-w-lg p-4 space-y-3'>
                  <Input
                    name='asset'
                    label='Asset'
                    placeholder='Asset ID'
                    required
                  />
                </div>
              </div>
            </div>
            {/* Peer Asset - End */}
            <div className='flex justify-end px-6 py-3'>
              <Button aria-label='create peer' type='submit'>
                {isSubmitting ? 'Creating peer ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
        {/* Create Peer form - END */}
      </div>
    </div>
  )
}

export async function action({ request }: ActionArgs) {
  const formData = Object.fromEntries(await request.formData())

  const result = createPeerSchema.safeParse(formData)

  if (!result.success) {
    return json({ errors: result.error.flatten() })
  }

  // TODO: Fix Apollo
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  // If we define 'maxPacketAmount' as a BigInt in the Zod schema we will receive
  // an error: 'Apollo Network request failed. Payload is not serializable: Do not
  // know how to serialize a BigInt.'.
  const response = await peerService.create({
    name: result.data.name,
    http: {
      outgoing: {
        endpoint: result.data.outgoingEndpoint,
        authToken: result.data.outgoingAuthToken
      },
      incoming: result.data.incomingAuthTokens
        ? {
            authTokens: result.data.incomingAuthTokens
              ?.replace(/ /g, '')
              .split(',')
          }
        : undefined
    },
    assetId: result.data.asset,
    staticIlpAddress: result.data.staticIlpAddress,
    ...(result.data.maxPacketAmount
      ? { maxPacketAmount: Number(result.data.maxPacketAmount) }
      : {})
  })

  if (!response?.createPeer.success) {
    const validationError = new z.ZodError([]).flatten()
    validationError.formErrors = [
      response?.createPeer.message ?? 'Could not create peer. Please try again!'
    ]

    return json<JSONError<typeof createPeerSchema>>({
      errors: validationError
    })
  }

  return redirect('/')
}
