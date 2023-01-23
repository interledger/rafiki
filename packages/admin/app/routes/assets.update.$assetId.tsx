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
import type { ActionArgs, LoaderArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { validatePositiveInt, validateId } from '../lib/validate.server'
import { gql } from '@apollo/client'
import { apolloClient } from '../lib/apolloClient.server'
import type {
  Asset,
  UpdateAssetInput,
  AssetMutationResponse
} from '../../generated/graphql'
import { useLoaderData } from '@remix-run/react'

function UpdateAsset({ asset }: { asset: Asset }) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const formErrors = useActionData<typeof action>()
  return (
    <Form method='post' id='asset-form'>
      <span>
        <label htmlFor='asset-id'>Asset ID</label>
        <div className='tooltip'>
          <input
            className={formErrors?.assetId ? 'input-error' : 'input fixed'}
            type='text'
            id='asset-id'
            name='assetId'
            defaultValue={asset.id}
            readOnly={formErrors?.assetId ? false : true}
          />
          {formErrors?.assetId ? (
            <p style={{ color: 'red' }}>{formErrors?.assetId}</p>
          ) : (
            <span className='tooltiptext'>This field cannot be changed</span>
          )}
        </div>
      </span>
      <span>
        <label htmlFor='asset-code'>Asset code</label>
        <div className='tooltip'>
          <input
            className='input fixed'
            type='text'
            id='asset-code'
            name='assetCode'
            defaultValue={asset.code}
            readOnly={true}
          />
          <span className='tooltiptext'>This field cannot be changed</span>
        </div>
      </span>
      <span>
        <label htmlFor='asset-scale'>Asset scale</label>
        <div className='tooltip'>
          <input
            className='input fixed'
            type='number'
            id='asset-scale'
            name='assetScale'
            defaultValue={asset.scale}
            readOnly={true}
          />
          <span className='tooltiptext'>This field cannot be changed</span>
        </div>
      </span>
      <span>
        <label htmlFor='withdrawal-threshold'>Withdrawl threshold</label>
        <div>
          <input
            className={
              formErrors?.withdrawalThreshold ? 'input-error' : 'input'
            }
            type='number'
            id='withdrawal-threshold'
            name='withdrawalThreshold'
            defaultValue={
              asset.withdrawalThreshold
                ? asset.withdrawalThreshold.toString()
                : ''
            }
          />
          {formErrors?.withdrawalThreshold ? (
            <p style={{ color: 'red' }}>{formErrors?.withdrawalThreshold}</p>
          ) : null}
        </div>
      </span>
      <div className='bottom-buttons form-actions'>
        <Link to='/assets'>
          <button type='button' className='basic-button left'>
            Cancel
          </button>
        </Link>
        <button
          type='submit'
          disabled={isSubmitting}
          className='basic-button right'
        >
          {isSubmitting ? 'Updating...' : 'Update'}
        </button>
      </div>
    </Form>
  )
}

export default function UpdateAssetPage() {
  const { asset }: { asset: Asset } = useLoaderData<typeof loader>()
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
  if (Object.values(formErrors).some(Boolean)) return json({ ...formErrors })

  const variables: { input: UpdateAssetInput } = {
    input: {
      id: formData.assetId as string,
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
      if (query.data) {
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
      if (query.data) {
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
  return [{ rel: 'stylesheet', href: formStyles }]
}
