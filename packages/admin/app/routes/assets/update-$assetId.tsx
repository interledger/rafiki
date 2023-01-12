import UpdateAsset, {
  links as UpdatedAssetLinks
} from '../../components/UpdateAsset.jsx'
import { redirect, json } from '@remix-run/node'
import fetch from '../../fetch'
import * as R from 'ramda'
import type { ActionArgs, LoaderArgs } from '@remix-run/node'
import { Link, useCatch } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { validatePositiveInt, validateId } from '../../lib/validate.server'

export default function UpdateAssetPage() {
  return (
    <main>
      <div className='header-row'>
        <h1>Update Asset</h1>
      </div>
      <div className='main-content'>
        <UpdateAsset />
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

  const variables = {
    input: {
      id: formData.assetId,
      withdrawalThreshold: formData.withdrawalThreshold
        ? parseInt(formData.withdrawalThreshold as string, 10)
        : null
    }
  }

  const query = `
    mutation UpdateAssetWithdrawalThreshold($input: UpdateAssetInput!){
        updateAssetWithdrawalThreshold(input: $input) {
            asset {
                id
            }
            code
            message
            success
        }
    }
    `

  const result = await fetch({ query, variables })

  const assetId = R.path(
    ['data', 'updateAssetWithdrawalThreshold', 'asset', 'id'],
    result
  )
  if (!assetId) {
    let errorMessage, status
    // In the case when GraphQL returns an error.
    if (R.path(['errors', 0, 'message'], result)) {
      errorMessage = R.path(['errors', 0, 'message'], result)
      status = parseInt(R.path(['errors', 0, 'code'], result), 10)
      // In the case when the GraphQL query is correct but the creation fails due to a conflict for instance.
    } else if (R.path(['data', 'updateAssetWithdrawalThreshold'], result)) {
      errorMessage = R.path(
        ['data', 'updateAssetWithdrawalThreshold', 'message'],
        result
      )
      status = parseInt(
        R.path(['data', 'updateAssetWithdrawalThreshold', 'code'], result),
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
  return redirect('/assets/' + assetId)
}

export async function loader({ params }: LoaderArgs) {
  invariant(params.assetId, `params.assetId is required`)
  const variables = {
    assetId: params.assetId
  }

  const query = `
      query Asset($assetId: String!) {
        asset(id: $assetId) {
          code
          id
          scale
          withdrawalThreshold
        }
      }
    `

  const result = await fetch({ query, variables })

  const asset = R.path(['data', 'asset'], result)

  invariant(asset, `Could not find asset with ID: ${params.assetId}`)

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
