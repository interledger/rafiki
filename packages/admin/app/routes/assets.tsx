import { Link, useCatch } from '@remix-run/react'
import formStyles from '../styles/dist/Form.css'
import displayItemsStyles from '../styles/dist/DisplayItems.css'
import { useLoaderData, Form } from '@remix-run/react'
import { redirect, json } from '@remix-run/node'
import type { ActionArgs } from '@remix-run/node'
import { gql } from '@apollo/client'
import { apolloClient } from '../lib/apolloClient.server'
import type { AssetEdge, Asset } from '../../generated/graphql'

function DisplayAssets({ assets }: { assets: Asset[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Asset ID</th>
          <th>Code</th>
          <th>Scale</th>
          <th>Withdrawl threshold</th>
        </tr>
      </thead>
      <tbody>
        {assets.length
          ? assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <Link to={asset.id}>{asset.id}</Link>
                </td>
                <td>{asset.code}</td>
                <td>{asset.scale}</td>
                <td>
                  {asset.withdrawalThreshold
                    ? asset.withdrawalThreshold.toString()
                    : 'null'}
                </td>
              </tr>
            ))
          : ''}
      </tbody>
    </table>
  )
}

// TODO: add a message if there are no assets to display
export default function AssetsPage() {
  const { assets }: { assets: Asset[] } = useLoaderData<typeof loader>()

  return (
    <main>
      <div className='header-row'>
        <h1>Assets</h1>
        <Form method='post' id='asset-search-form'>
          <span>
            <input
              type='search'
              id='asset-id'
              name='assetId'
              // TODO: update placeholder when search bar becomes global
              placeholder='Search asset by ID'
              required
            />
            <div className='form-actions'>
              <button className='search-button'>
                <img alt='Search' src={require('../../public/search.svg')} />
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
  const assets = await apolloClient
    .query({
      query: gql`
        query Assets {
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
    })
    .then((query): Asset[] => {
      if (query.data) {
        return query.data.assets.edges.map((element: AssetEdge) => element.node)
      } else {
        throw new Error(`No assets were found`)
      }
    })

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
      <h1>Error</h1>
      <p>There was an error loading the assets.</p>
      {error.message.length > 0 && <p>Error: {error.message}</p>}
      <Link to='/assets'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [
    { rel: 'stylesheet', href: formStyles },
    { rel: 'stylesheet', href: displayItemsStyles }
  ]
}
