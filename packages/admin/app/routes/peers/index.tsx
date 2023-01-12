import { useCatch, Link, Form } from '@remix-run/react'
import styles from '../../styles/dist/Form.css'
import DisplayPeers, {
  links as DisplayItemsLinks
} from '../../components/DisplayPeers'
import { useLoaderData } from '@remix-run/react'
import * as R from 'ramda'
import fetch from '../../fetch'
import type { ActionArgs } from '@remix-run/node'
import { redirect, json } from '@remix-run/node'
import invariant from 'tiny-invariant'

// TODO: add a message if there are no peers to display
export default function PeersPage() {
  const { peers } = useLoaderData<typeof loader>()

  return (
    <main>
      <div className='header-row'>
        <h1>Peers</h1>
        <Form method='post' id='peer-search-form'>
          <span>
            <input type='search' id='peer-id' name='peerId' required />
            <div className='form-actions'>
              <button className='search-button'>
                <img alt='Search' src={require('../../../public/search.svg')} />
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
  const query = `
  {
    peers {
      edges {
        node {
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
        }
      }
    }
  }
  `
  const result = await fetch({ query })
  const peers = R.path(['data', 'peers', 'edges'], result)
  invariant(peers, `No peers were found`)

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
      <p>There was an error loading the peers.</p>
      {error.message.length > 0 && <p>Error: {error.message}</p>}
      <Link to='/peers'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [{ rel: 'stylesheet', href: styles }, ...DisplayItemsLinks()]
}
