import { json, redirect, type ActionArgs } from '@remix-run/node'
import { Form, useActionData, useNavigation } from '@remix-run/react'
import { Button } from '~/components/ui/Button'
import ErrorPanel from '~/components/ui/ErrorPanel'
import { Input } from '~/components/ui/Input'
import { peerService } from '~/services/bootstrap.server'
import { createPeerSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import PageHeader from '~/components/PageHeader'

export default function CreatePeerPage() {
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Peer</h3>
          <Button aria-label='go back to peers page' to='/peers'>
            Go to peers page
          </Button>
        </PageHeader>
        {/* Create Peer form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>

          <fieldset disabled={isSubmitting}>
            {/* Peer General Info */}
            <div className='grid grid-cols-1py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
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
            {/* Peer HTTP Info - END */}
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
                    error={response?.errors?.fieldErrors?.asset}
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
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createPeerSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = createPeerSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
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
      : { maxPacketAmount: undefined })
  })

  if (!response?.success) {
    errors.message = [
      response?.message ?? 'Could not create peer. Please try again!'
    ]
    return json({ errors }, { status: 400 })
  }

  return redirect('/')
}
