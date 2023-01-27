import formStyles from '../styles/dist/Form.css'
import {
  Form,
  Link,
  useCatch,
  useActionData,
  useTransition as useNavigation
} from '@remix-run/react'
import { redirect, json } from '@remix-run/node'
import * as R from 'ramda'
import type { ActionArgs } from '@remix-run/node'
import {
  validateString,
  validateIlpAddress,
  validatePositiveInt,
  validateId
} from '../lib/validate.server'
import { gql } from '@apollo/client'
import type {
  CreatePeerInput,
  CreatePeerMutationResponse
} from '../../generated/graphql'
import { apolloClient } from '../lib/apolloClient.server'

function NewPeer() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const formErrors = useActionData<typeof action>()

  return (
    <Form method='post' id='peer-form'>
      <span>
        <label htmlFor='name'>Name</label>
        <div>
          <input
            className={formErrors?.name ? 'input-error' : 'input'}
            type='text'
            id='name'
            name='name'
          />
          {formErrors?.name ? (
            <p style={{ color: 'red' }}>{formErrors?.name}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='ilp-address'>Static ILP address *</label>
        <div>
          <input
            className={formErrors?.staticIlpAddress ? 'input-error' : 'input'}
            type='text'
            id='ilp-address'
            name='staticIlpAddress'
            required
          />
          {formErrors?.staticIlpAddress ? (
            <p style={{ color: 'red' }}>{formErrors?.staticIlpAddress}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='incoming-auth-tokens'>
          Incoming HTTP auth tokens *
        </label>
        <div>
          <input
            className={formErrors?.incomingAuthTokens ? 'input-error' : 'input'}
            type='text'
            id='incoming-auth-tokens'
            name='incomingAuthTokens'
          />
          <p style={{ color: 'grey' }}>
            Accepts a comma separated list of tokens
          </p>
          {formErrors?.incomingAuthTokens ? (
            <p style={{ color: 'red' }}>{formErrors?.incomingAuthTokens}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-auth-token'>Outgoing HTTP auth token *</label>
        <div>
          {/* TODO: soon it will only be required for either incoming HTTP fields or outgoing HTTP fileds to be filled */}
          <input
            className={formErrors?.outgoingAuthToken ? 'input-error' : 'input'}
            type='text'
            id='outgoing-auth-token'
            name='outgoingAuthToken'
            required
          />
          {formErrors?.outgoingAuthToken ? (
            <p style={{ color: 'red' }}>{formErrors?.outgoingAuthToken}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-endpoint'>Outgoing HTTP endpoint *</label>
        <div>
          <input
            className={formErrors?.outgoingEndpoint ? 'input-error' : 'input'}
            type='text'
            id='outgoing-endpoint'
            name='outgoingEndpoint'
            required
          />
          {formErrors?.outgoingEndpoint ? (
            <p style={{ color: 'red' }}>{formErrors?.outgoingEndpoint}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='asset-code'>Asset ID *</label>
        <div>
          <input
            className={formErrors?.assetId ? 'input-error' : 'input'}
            type='text'
            id='asset-id'
            name='assetId'
            required
          />
          {formErrors?.assetId ? (
            <p style={{ color: 'red' }}>{formErrors?.assetId}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='max-pckt-amount'>Max packet amount</label>
        <div>
          <input
            className={formErrors?.maxPacketAmount ? 'input-error' : 'input'}
            type='number'
            id='max-pckt-amount'
            name='maxPacketAmount'
          />
          {formErrors?.maxPacketAmount ? (
            <p style={{ color: 'red' }}>{formErrors?.maxPacketAmount}</p>
          ) : null}
        </div>
      </span>
      <div className='bottom-buttons form-actions'>
        <Link to='/peers'>
          <button type='button' className='basic-button left'>
            Cancel
          </button>
        </Link>
        <button
          type='submit'
          disabled={isSubmitting}
          className='basic-button right'
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Form>
  )
}

export default function CreatePeerPage() {
  return (
    <main>
      <div className='header-row'>
        <h1>Create Peer</h1>
      </div>
      <div className='main-content'>
        <NewPeer />
      </div>
    </main>
  )
}

export async function action({ request }: ActionArgs) {
  const formData = Object.fromEntries(await request.formData())

  const formErrors = {
    name: validateString(formData.name, 'name', false),
    assetId: validateId(formData.assetId, 'asset ID'),
    incomingAuthTokens: validateString(
      formData.incomingAuthTokens,
      'incoming auth tokens',
      false
    ), // TODO: soon it will only be required for either incoming HTTP fields or outgoing HTTP fileds to be filled (or both)
    outgoingAuthToken: validateString(
      formData.outgoingAuthToken,
      'outgoing auth token'
    ),
    outgoingEndpoint: validateString(
      formData.outgoingEndpoint,
      'outgoing endpoint'
    ),
    maxPacketAmount: validatePositiveInt(
      formData.maxPacketAmount,
      'max packet amount',
      false,
      false
    ),
    staticIlpAddress: validateIlpAddress(formData.staticIlpAddress)
  }

  // If there are errors, return the form errors object
  if (Object.values(formErrors).some(Boolean)) return json({ ...formErrors })

  const incomingAuthTokens = formData.incomingAuthTokens
    ? (formData.incomingAuthTokens as string)
    : null

  const variables: { input: CreatePeerInput } = {
    input: {
      name: formData.name as string,
      assetId: formData.assetId as string,
      http: {
        incoming: incomingAuthTokens
          ? {
              authTokens: incomingAuthTokens?.replace(/ /g, '').split(',')
            }
          : undefined,
        outgoing: {
          authToken: formData.outgoingAuthToken as string,
          endpoint: formData.outgoingEndpoint as string
        }
      },
      maxPacketAmount: formData.maxPacketAmount
        ? BigInt(formData.maxPacketAmount as string)
        : undefined,
      staticIlpAddress: formData.staticIlpAddress as string
    }
  }

  const peerId = await apolloClient
    .mutate({
      mutation: gql`
        mutation CreatePeer($input: CreatePeerInput!) {
          createPeer(input: $input) {
            code
            message
            success
            peer {
              id
            }
          }
        }
      `,
      variables: variables
    })
    .then((query): CreatePeerMutationResponse => {
      if (query.data) {
        return query.data.createPeer.peer.id
      } else {
        let errorMessage, status
        // In the case when GraphQL returns an error.
        if (R.path(['errors', 0, 'message'], query)) {
          errorMessage = R.path(['errors', 0, 'message'], query)
          status = parseInt(R.path(['errors', 0, 'code'], query), 10)
          // In the case when the GraphQL query is correct but the creation fails due to a conflict for instance.
        } else if (R.path(['data', 'createPeer'], query)) {
          errorMessage = R.path(['data', 'createPeer', 'message'], query)
          status = parseInt(R.path(['data', 'createPeer', 'code'], query), 10)
          // In the case where no error message could be found.
        } else {
          errorMessage = 'Peer was not successfully created.'
        }
        throw json(
          {
            message: errorMessage
          },
          {
            status: status
          }
        )
      }
    })

  return redirect('/peers/' + peerId)
}

export function CatchBoundary() {
  const caughtResponse = useCatch()
  let heading = caughtResponse.status ? `${caughtResponse.status}` : ''
  if (caughtResponse.statusText) {
    heading += ` ${caughtResponse.statusText}`
  }
  return (
    <div>
      {heading && <h2>{heading}</h2>}
      <p>{caughtResponse.data?.message || 'An Error Occurred'}</p>
      <Link to='/peers'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [{ rel: 'stylesheet', href: formStyles }]
}
