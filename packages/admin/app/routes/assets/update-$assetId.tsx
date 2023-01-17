import UpdateAsset, {
  links as UpdatedAssetLinks
} from '../../components/UpdateAsset'
import { redirect, json } from '@remix-run/node'
import * as R from 'ramda'
import type { ActionArgs, LoaderArgs } from '@remix-run/node'
import { Link, useCatch } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { validatePositiveInt, validateId } from '../../lib/validate.server'
import { gql } from '@apollo/client'
import { apolloClient } from '../../lib/apolloClient'
import type {
  Asset,
  UpdateAssetInput,
  AssetMutationResponse
} from '../../../../backend/src/graphql/generated/graphql'
import { useLoaderData } from '@remix-run/react'

export default function UpdateAssetPage() {
  const { asset }: { asset: Asset } = useLoaderData()
  return (
    <main>
      <div className='header-row'>
        <h1>Update Asset</h1>
      </div>
      <div className='main-content'>
        <UpdateAsset asset={asset} />
      </div>
    </main>
  )
}

export async function action({ request }: ActionArgs) {
  const formData = Object.fromEntries(await request.formData())

  const formErrors = {
    assetId: validateId(formData.assetId, 'asset ID'),
    withdrawalThreshold: validatePositiveInt(
      formData.withdrawalThreshold,
      'withdrawal threshold',
      false
    )
  }

  // If there are errors, return the form errors object
  if (Object.values(formErrors).some(Boolean)) return { formErrors }

  const variables: { input: UpdateAssetInput } = {
    input: {
      id: formData.assetId,
      withdrawalThreshold: formData.withdrawalThreshold
        ? parseInt(formData.withdrawalThreshold as string, 10)
        : null
    }
  }

  const assetId = await apolloClient
    .mutate({
      mutation: gql`
        mutation UpdateAssetWithdrawalThreshold($input: UpdateAssetInput!) {
          updateAssetWithdrawalThreshold(input: $input) {
            asset {
              id
            }
            code
            message
            success
          }
        }
      `,
      variables: variables
    })
    .then((query): AssetMutationResponse => {
      if (query.data.updateAssetWithdrawalThreshold.asset.id) {
        return query.data.updateAssetWithdrawalThreshold.asset.id
      } else {
        let errorMessage, status
        // In the case when GraphQL returns an error.
        if (R.path(['errors', 0, 'message'], query)) {
          errorMessage = R.path(['errors', 0, 'message'], query)
          status = parseInt(R.path(['errors', 0, 'code'], query), 10)
          // In the case when the GraphQL query is correct but the creation fails due to a conflict for instance.
        } else if (R.path(['data', 'updateAssetWithdrawalThreshold'], query)) {
          errorMessage = R.path(
            ['data', 'updateAssetWithdrawalThreshold', 'message'],
            query
          )
          status = parseInt(
            R.path(['data', 'updateAssetWithdrawalThreshold', 'code'], query),
            10
          )
          // In the case where no error message could be found.
        } else {
          errorMessage = 'Asset was not successfully updated.'
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

  return redirect('/assets/' + assetId)
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
      if (query.data.asset) {
        return query.data.asset
      } else {
        throw new Error(`Could not find asset with ID: ${params.assetId}`)
      }
    })

  return json({ asset: asset })
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
      <Link to='/assets'>
        <button className='basic-button'>Back</button>
      </Link>
    </div>
  )
}

export function links() {
  return [...UpdatedAssetLinks()]
}
