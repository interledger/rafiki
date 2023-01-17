import NewPeer, { links as NewPeerLinks } from '../../components/NewPeer'
import { redirect, json } from '@remix-run/node'
import * as R from 'ramda'
import type { ActionArgs } from '@remix-run/node'
import { Link, useCatch } from '@remix-run/react'
import {
  validateString,
  validateUrl,
  validateIlpAddress,
  validatePositiveInt,
  validateId
} from '../../lib/validate.server'
import { gql } from '@apollo/client'
import type {
  CreatePeerInput,
  CreatePeerMutationResponse
} from '../../../../backend/src/graphql/generated/graphql'
import { apolloClient } from '../../lib/apolloClient'

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
      if (query.data.createPeer.peer.id) {
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
  return [...NewPeerLinks()]
}
