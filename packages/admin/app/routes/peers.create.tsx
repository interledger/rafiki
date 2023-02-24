import { json, redirect, type ActionArgs } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { Button } from '~/components/ui/Button'
import ErrorPanel from '~/components/ui/ErrorPanel'
import { Input } from '~/components/ui/Input'
import { assetService, peerService } from '~/services/bootstrap.server'
import { createPeerSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import PageHeader from '~/components/PageHeader'
import { commitSession, getSession, setMessage } from '~/lib/message.server'
import { type Asset } from '~/generated/graphql'

export async function loader() {
  let assets: Asset[] = []
  let hasNextPage = true
  let after: string | undefined

  while (hasNextPage) {
    const response = await assetService.list({ after })

    if (response.edges) {
      assets = [...assets, ...response.edges.map((edge) => edge.node)]
    }

    if (response.pageInfo.hasNextPage) {
      hasNextPage = true
      if (response.pageInfo.endCursor) {
        after = response?.pageInfo?.endCursor
      } else {
        after = assets[assets.length - 1].id
      }
    } else {
      hasNextPage = false
    }
  }

  return json({ assets })
}

export default function CreatePeerPage() {
  const { assets } = useLoaderData<typeof loader>()
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
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
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
            <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>HTTP Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
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
            <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Asset Informations</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='asset'
                    label='Asset'
                    placeholder='Select asset'
                    required
                    autoComplete='off'
                    list='assets'
                    error={response?.errors?.fieldErrors?.asset}
                  />
                  <datalist id='assets'>
                    {assets.map((asset) => (
                      <option
                        className='bg-red-200'
                        key={asset.id}
                        value={asset.id}
                      >
                        {asset.code} (Scale: {asset.scale} |{' '}
                        {asset.withdrawalThreshold
                          ? `Withdrawal treshold ${asset.withdrawalThreshold}`
                          : 'No withdrawal treshold'}
                        )
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
            {/* Peer Asset - End */}
            <div className='flex justify-end py-3'>
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
      ? { maxPacketAmount: result.data.maxPacketAmount }
      : { maxPacketAmount: undefined })
  })

  if (!response?.success) {
    errors.message = [
      response?.message ?? 'Could not create peer. Please try again!'
    ]
    return json({ errors }, { status: 400 })
  }

  const session = await getSession(request.headers.get('cookie'))

  setMessage(session, {
    content: 'Peer created.',
    type: 'success'
  })

  return redirect(`/peers/${response.peer?.id}`, {
    headers: { 'Set-Cookie': await commitSession(session) }
  })
}
