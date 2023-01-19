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
  validateUrl,
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
  const actionData = useActionData()

  return (
    <Form method='post' id='peer-form'>
      <span>
        <label htmlFor='name'>Name</label>
        <div>
          <input
            className={actionData?.formErrors?.name ? 'input-error' : 'input'}
            type='text'
            id='name'
            name='name'
          />
          {actionData?.formErrors?.name ? (
            <p style={{ color: 'red' }}>{actionData?.formErrors?.name}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='ilp-address'>Static ILP address</label>
        <div>
          <input
            className={
              actionData?.formErrors?.staticIlpAddress ? 'input-error' : 'input'
            }
            type='text'
            id='ilp-address'
            name='staticIlpAddress'
            required
          />
          {actionData?.formErrors?.staticIlpAddress ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.staticIlpAddress}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='incoming-auth-tokens'>Incoming HTTP auth tokens</label>
        <div>
          <input
            className={
              actionData?.formErrors?.incomingAuthTokens
                ? 'input-error'
                : 'input'
            }
            type='text'
            id='incoming-auth-tokens'
            name='incomingAuthTokens'
          />
          <p style={{ color: 'grey' }}>
            Accepts a comma separated list of tokens
          </p>
          {actionData?.formErrors?.incomingAuthTokens ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.incomingAuthTokens}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-auth-token'>Outgoing HTTP auth token</label>
        <div>
          {/* TODO: soon it will only be required for either incoming HTTP fields or outgoing HTTP fileds to be filled */}
          <input
            className={
              actionData?.formErrors?.outgoingAuthToken
                ? 'input-error'
                : 'input'
            }
            type='text'
            id='outgoing-auth-token'
            name='outgoingAuthToken'
            required
          />
          {actionData?.formErrors?.outgoingAuthToken ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.outgoingAuthToken}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-endpoint'>Outgoing HTTP endpoint</label>
        <div>
          <input
            className={
              actionData?.formErrors?.outgoingEndpoint ? 'input-error' : 'input'
            }
            type='text'
            id='outgoing-endpoint'
            name='outgoingEndpoint'
            required
          />
          {actionData?.formErrors?.outgoingEndpoint ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.outgoingEndpoint}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='asset-code'>Asset ID</label>
        <div>
          <input
            className={
              actionData?.formErrors?.assetId ? 'input-error' : 'input'
            }
            type='text'
            id='asset-id'
            name='assetId'
            required
          />
          {actionData?.formErrors?.assetId ? (
            <p style={{ color: 'red' }}>{actionData?.formErrors?.assetId}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='max-pckt-amount'>Max packet amount</label>
        <div>
          <input
            className={
              actionData?.formErrors?.maxPacketAmount ? 'input-error' : 'input'
            }
            type='number'
            id='max-pckt-amount'
            name='maxPacketAmount'
          />
          {actionData?.formErrors?.maxPacketAmount ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.maxPacketAmount}
            </p>
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
  const incomingAuthTokens = formData.incomingAuthTokens
    ? (formData.incomingAuthTokens as string)
    : null

  const formErrors = {
    name: validateString(formData.name, 'name', false),
    assetId: validateId(formData.assetId, 'asset ID'),
    incomingAuthTokens: validateString(
      incomingAuthTokens,
      'incoming auth tokens',
      false
    ), // TODO: soon it will only be required for either incoming HTTP fields or outgoing HTTP fileds to be filled (or both)
    outgoingAuthToken: validateString(
      formData.outgoingAuthToken,
      'outgoing auth token'
    ), // TODO: Add validation for string[]
    outgoingEndpoint: validateUrl(
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
  if (Object.values(formErrors).some(Boolean)) return { formErrors }

  const variables: { input: CreatePeerInput } = {
    input: {
      name: formData.name,
      assetId: formData.assetId,
      http: {
        incoming: incomingAuthTokens
          ? {
              authTokens: incomingAuthTokens?.replace(/ /g, '').split(',')
            }
          : null,
        outgoing: {
          authToken: formData.outgoingAuthToken,
          endpoint: formData.outgoingEndpoint
        }
      },
      maxPacketAmount: formData.maxPacketAmount
        ? parseInt(formData.maxPacketAmount as string, 10)
        : null,
      staticIlpAddress: formData.staticIlpAddress
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
