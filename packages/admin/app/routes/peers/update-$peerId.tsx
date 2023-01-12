// TODO: This file is still a very rough work in progress
import UpdatePeer, {
  links as UpdatedPeerLinks
} from '../../components/UpdatePeer.jsx'
import { redirect, json } from '@remix-run/node'
import fetch from '../../fetch'
import * as R from 'ramda'
import type { ActionArgs, LoaderArgs } from '@remix-run/node'
import { Link, useCatch } from '@remix-run/react'
import invariant from 'tiny-invariant'

export default function UpdatePeerPage() {
  return (
    <main>
      <div className='header-row'>
        <h1>Update Peer</h1>
      </div>
      <div className='main-content'>
        <UpdatePeer />
      </div>
    </main>
  )
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData()

  // TODO: Add validation
  // TODO: no fields are required here except ID
  const variables = {
    input: {
      id: formData.get('peerId'),
      http: {
        incoming: {
          authTokens: formData.get('incomingAuthTokens').split(', ') // TODO: consider how best to handle string[]
        },
        outgoing: {
          authToken: formData.get('outgoingAuthToken'),
          endpoint: formData.get('outgoingEndpoint')
        }
      },
      maxPacketAmount: formData.get('maxPacketAmount')
        ? parseInt(formData.get('maxPacketAmount'), 10)
        : null,
      staticIlpAddress: formData.get('staticIlpAddress')
    }
  }

  const query = `
    mutation UpdatePeer($input: UpdatePeerInput!) {
        updatePeer(input: $input) {
            code
            message
            success
            peer {
                id
            }
        }
    }
    `

  const result = await fetch({ query, variables })

  const peerId = R.path(['data', 'updatePeer', 'peer', 'id'], result)
  if (!peerId) {
    let errorMessage, status
    // In the case when GraphQL returns an error.
    if (R.path(['errors', 0, 'message'], result)) {
      errorMessage = R.path(['errors', 0, 'message'], result)
      status = parseInt(R.path(['errors', 0, 'code'], result), 10)
      // In the case when the GraphQL query is correct but the creation fails due to a conflict for instance.
    } else if (R.path(['data', 'updatePeer'], result)) {
      errorMessage = R.path(['data', 'updatePeer', 'message'], result)
      status = parseInt(R.path(['data', 'updatePeer', 'code'], result), 10)
      // In the case where no error message could be found.
    } else {
      errorMessage = 'Peer was not successfully updated.'
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
  return redirect('/peers/' + peerId)
}

export async function loader({ params }: LoaderArgs) {
  invariant(params.peerId, `params.peerId is required`)
  const variables = {
    peerId: params.peerId
  }

  const query = `
      query Peer($peerId: String!) {
        peer(id: $peerId) {
          id
          staticIlpAddress
          http {
            outgoing {
              endpoint
            }
          }
          asset {
            code
            scale
          }
          maxPacketAmount
        }
      }
      `
  const result = await fetch({ query, variables })

  const peer = R.path(['data', 'peer'], result)

  invariant(peer, `Could not find peer with ID ${params.peerId}`)

  return json({ peer: peer })
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
  return [...UpdatedPeerLinks()]
}
