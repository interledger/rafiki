import { Link, useCatch } from '@remix-run/react'
import styles from '../../styles/dist/Form.css'
import DisplayAssets, {
  links as DisplayItemsLinks
} from '../../components/DisplayAssets'
import { useLoaderData, Form } from '@remix-run/react'
import * as R from 'ramda'
import fetch from '../../fetch'
import { redirect, json } from '@remix-run/node'
import type { ActionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'

// TODO: add a message if there are no assets to display
export default function AssetsPage() {
  const { assets } = useLoaderData<typeof loader>()

  return (
    <main>
      <div className='header-row'>
        <h1>Assets</h1>
        <Form method='post' id='asset-search-form'>
          <span>
            <input type='search' id='asset-id' name='assetId' required />
            <div className='form-actions'>
              <button className='search-button'>
                <img alt='Search' src={require('../../../public/search.svg')} />
              </button>
            </div>
          </span>
        </Form>
        <Link to='/assets/create'>
          <button className='basic-button'>Create Asset</button>
        </Link>
      </div>
      <div className='main-content'>
        <DisplayAssets assets={assets} />
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
        assets {
            edges {
                node {
                    code
                    id
                    scale
                    withdrawalThreshold
                }
            }
        }
    }
    `
  const result = await fetch({ query })
  const assets = R.path(['data', 'assets', 'edges'], result)
  invariant(assets, `No assets were found`)

  return json({ assets: assets })
}

export async function action({ request }: ActionArgs) {
  // TODO: extend to be a global search bar
  const formData = await request.formData()
  const assetData = {
    assetID: formData.get('assetId')
  }

  if (!assetData.assetID) {
    throw json(
      {
        message: 'Unable to access asset ID'
      },
      {
        status: 404,
        statusText: 'Not Found'
      }
    )
  }
  return redirect('/assets/' + assetData.assetID)
}

export function CatchBoundary() {
  const caughtResponse = useCatch()
  return (
    <div>
      {caughtResponse.status && caughtResponse.statusText && (
        <h2>{caughtResponse.status + ' ' + caughtResponse.statusText}</h2>
      )}
      <p>{caughtResponse.data?.message || 'An Error Occurred'}</p>
      <Link to='/assets'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div>
      <p>There was an error loading the assets.</p>
      {error.message.length > 0 && <p>Error: {error.message}</p>}
      <Link to='/assets'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [{ rel: 'stylesheet', href: styles }, ...DisplayItemsLinks()]
}
