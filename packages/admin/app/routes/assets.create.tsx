import {
  Form,
  Link,
  useActionData,
  useCatch,
  useTransition as useNavigation
} from '@remix-run/react'
import formStyles from '../styles/dist/Form.css'
import { redirect, json } from '@remix-run/node'
import * as R from 'ramda'
import type { ActionArgs } from '@remix-run/node'
import { validateString, validatePositiveInt } from '../lib/validate.server'
import { gql } from '@apollo/client'
import type {
  CreateAssetInput,
  AssetMutationResponse
} from '../../generated/graphql'
import { apolloClient } from '../lib/apolloClient.server'

function NewAsset() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const formErrors = useActionData<typeof action>()
  return (
    <Form method='post' id='asset-form'>
      <span>
        <label htmlFor='asset-code'>Asset code *</label>
        <div>
          <input
            className={formErrors?.assetCode ? 'input-error' : 'input'}
            type='text'
            id='asset-code'
            name='assetCode'
            required
          />
          {formErrors?.assetCode ? (
            <p style={{ color: 'red' }}>{formErrors?.assetCode}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='asset-scale'>Asset scale *</label>
        <div>
          <input
            className={formErrors?.assetScale ? 'input-error' : 'input'}
            type='number'
            id='asset-scale'
            name='assetScale'
            required
          />
          {formErrors?.assetScale ? (
            <p style={{ color: 'red' }}>{formErrors?.assetScale}</p>
          ) : null}
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
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Form>
  )
}

export default function CreateAssetPage() {
  return (
    <main>
      <div className='header-row'>
        <h1>Create Asset</h1>
      </div>
      <div className='main-content'>
        <NewAsset />
      </div>
    </main>
  )
}

export async function action({ request }: ActionArgs) {
  const formData = Object.fromEntries(await request.formData())

  const formErrors = {
    assetCode: validateString(formData.assetCode, 'asset code'),
    assetScale: validatePositiveInt(formData.assetScale, 'asset scale'),
    withdrawalThreshold: validatePositiveInt(
      formData.withdrawalThreshold,
      'withdrawal threshold',
      false
    )
  }

  // If there are errors, return the form errors object
  if (Object.values(formErrors).some(Boolean)) return json({ ...formErrors })

  const variables: { input: CreateAssetInput } = {
    input: {
      code: formData.assetCode as string,
      scale: parseInt(formData.assetScale as string, 10),
      withdrawalThreshold: formData.withdrawalThreshold
        ? parseInt(formData.withdrawalThreshold as string, 10)
        : null
    }
  }

  const assetId = await apolloClient
    .mutate({
      mutation: gql`
        mutation Mutation($input: CreateAssetInput!) {
          createAsset(input: $input) {
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
        return query.data.createAsset.asset.id
      } else {
        let errorMessage, status
        // In the case when GraphQL returns an error.
        if (R.path(['errors', 0, 'message'], query)) {
          errorMessage = R.path(['errors', 0, 'message'], query)
          status = parseInt(R.path(['errors', 0, 'code'], query), 10)
          // In the case when the GraphQL query is correct but the creation fails due to a conflict for instance.
        } else if (R.path(['data', 'createAsset'], query)) {
          errorMessage = R.path(['data', 'createAsset', 'message'], query)
          status = parseInt(R.path(['data', 'createAsset', 'code'], query), 10)
          // In the case where no error message could be found.
        } else {
          errorMessage = 'Asset was not successfully created.'
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
