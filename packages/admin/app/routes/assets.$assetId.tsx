import DisplayAsset, {
  links as DisplayItemsLinks
} from '../components/DisplayAsset'
import { json, redirect } from '@remix-run/node'
import { Link, useLoaderData, Form, useParams } from '@remix-run/react'
import type { LoaderArgs, ActionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { gql } from '@apollo/client'
import { apolloClient } from '../lib/apolloClient'
import type { Asset } from '../../generated/graphql'

export default function ViewAssetsPage() {
  const { asset }: { asset: Asset } = useLoaderData<typeof loader>()
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
              defaultValue={asset.id}
              required
            />
            <div className='form-actions'>
              <button className='search-button'>
                <img alt='Search' src={require('../../public/search.svg')} />
              </button>
            </div>
          </span>
        </Form>
        <Link to={'/assets/update-' + asset.id}>
          <button className='basic-button'>Update</button>
        </Link>
      </div>
      <div className='main-content'>
        <DisplayAsset asset={asset} />
      </div>
      <div className='bottom-buttons'>
        <button className='basic-button left' disabled={true}>
          Delete
        </button>
        <Link to='/assets'>
          <button className='basic-button right'>Done</button>
        </Link>
      </div>
    </main>
  )
}

export async function loader({ params }: LoaderArgs) {
  invariant(params.assetId, `params.assetId is required`)

  const variables: { assetId: string } = {
    assetId: params.assetId
  }

  const asset = await apolloClient
    .query({
      query: gql`
        query Asset($assetId: String!) {
          asset(id: $assetId) {
            code
            id
            scale
            withdrawalThreshold
            createdAt
          }
        }
      `,
      variables: variables
    })
    .then((query): Asset => {
      if (query.data) {
        const formattedAsset: Asset = { ...query.data.asset }
        formattedAsset.createdAt = new Date(
          formattedAsset.createdAt
        ).toLocaleString()
        return formattedAsset
      } else {
        throw new Error(`Could not find asset with ID: ${params.assetId}`)
      }
    })

  return json({ asset: asset })
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

export function ErrorBoundary({ error }: { error: Error }) {
  const { assetId } = useParams()

  if (assetId) {
    return (
      <div>
        <p>There was an error loading the asset with ID {assetId}.</p>
        {error.message.length > 0 && <p>Error: {error.message}</p>}
        <Link to='/assets'>
          <button className='basic-button'>Back</button>
        </Link>
      </div>
    )
  }
  return (
    <div>
      <p>There was an error loading this asset.</p>
      {error.message.length > 0 && <p>Error: {error.message}</p>}
    </div>
  )
}

export function links() {
  return [...DisplayItemsLinks()]
}
