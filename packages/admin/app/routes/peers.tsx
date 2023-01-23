import { useCatch, Link, Form } from '@remix-run/react'
import styles from '../styles/dist/main.css'
import formStyles from '../styles/dist/Form.css'
import displayItemsStyles from '../styles/dist/DisplayItems.css'
import { useLoaderData } from '@remix-run/react'
import type { ActionArgs } from '@remix-run/node'
import { redirect, json } from '@remix-run/node'
import { gql } from '@apollo/client'
import { apolloClient } from '../lib/apolloClient.server'
import type { PeerEdge, Peer } from '../../generated/graphql'

function DisplayPeers({ peers }: { peers: Peer[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Peer name / ID</th>
          <th>Static ILP address</th>
          <th>Asset code</th>
          <th>Asset scale</th>
          <th>Outgoing endpoint</th>
        </tr>
      </thead>
      <tbody>
        {peers.length
          ? peers.map((peer) => (
              <tr key={peer.id}>
                <td>
                  <Link to={peer.id}>{peer.name ? peer.name : peer.id}</Link>
                </td>
                <td>{peer.staticIlpAddress}</td>
                <td>{peer.asset.code}</td>
                <td>{peer.asset.scale}</td>
                <td>{peer.http.outgoing.endpoint}</td>
              </tr>
            ))
          : ''}
      </tbody>
    </table>
  )
}

// TODO: add a message if there are no peers to display
export default function PeersPage() {
  const { peers }: { peers: Peer[] } = useLoaderData<typeof loader>()

  return (
    <main>
      <div className='header-row'>
        <h1>Peers</h1>
        <Form method='post' id='peer-search-form'>
          <span>
            <input
              type='search'
              id='peer-id'
              name='peerId'
              // TODO: update placeholder when search bar becomes global
              placeholder='Search peer by ID'
              required
            />
            <div className='form-actions'>
              <button className='search-button'>
                <img alt='Search' src={require('../../public/search.svg')} />
              </button>
            </div>
          </span>
        </Form>
        <Link to='/peers/create'>
          <button className='basic-button'>Create Peer</button>
        </Link>
      </div>
      <div className='main-content'>
        <DisplayPeers peers={peers} />
      </div>
      <div className='bottom-buttons'>
        <button disabled={true} className='basic-button left'>
          Previous
        </button>
        <button disabled={true} className='basic-button right'>
          Next
        </button>
      </div>
    </main>
  )
}

export async function loader() {
  const peers = await apolloClient
    .query({
      query: gql`
        query Peers {
          peers {
            edges {
              node {
                id
                name
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
              }
            }
          }
        }
      `
    })
    .then((query): Peer[] => {
      if (query.data) {
        return query.data.peers.edges.map((element: PeerEdge) => element.node)
      } else {
        throw new Error(`No peers were found`)
      }
    })

  return json({ peers: peers })
}

export async function action({ request }: ActionArgs) {
  // TODO: extend to be a global search bar
  const formData = await request.formData()
  const peerData = {
    peerID: formData.get('peerId')
  }

  if (!peerData.peerID) {
    throw json(
      {
        message: 'Unable to access peer ID'
      },
      {
        status: 404,
        statusText: 'Not Found'
      }
    )
  }
  return redirect('/peers/' + peerData.peerID)
}

export function CatchBoundary() {
  const caughtResponse = useCatch()
  return (
    <div>
      {caughtResponse.status && caughtResponse.statusText && (
        <h2>{caughtResponse.status + ' ' + caughtResponse.statusText}</h2>
      )}
      <p>{caughtResponse.data?.message || 'An Error Occurred'}</p>
      <Link to='/peers'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div>
      <h1>Error</h1>
      <p>There was an error loading the peers.</p>
      {error.message.length > 0 && <p>Error: {error.message}</p>}
      <Link to='/peers'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [
    { rel: 'stylesheet', href: formStyles },
    { rel: 'stylesheet', href: displayItemsStyles },
    { rel: 'stylesheet', href: styles }
  ]
}
