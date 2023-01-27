import {
  Form,
  Link,
  useActionData,
  useCatch,
  useTransition as useNavigation
} from '@remix-run/react'
import formStyles from '../styles/dist/Form.css'
import { redirect, json } from '@remix-run/node'
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
        ? BigInt(formData.withdrawalThreshold as string)
        : undefined
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
      if (query?.data?.createAsset?.asset) {
        return query.data.createAsset.asset.id
      } else {
        let errorMessage = ''
        let status
        // In the case when GraphQL returns an error.
        if (query?.errors) {
          query.errors.forEach((error): void => {
            errorMessage = error.message + ', '
          })
          // Remove trailing comma.
          errorMessage = errorMessage.slice(0, -2)
          // In the case when the GraphQL returns data with an error message.
        } else if (query?.data?.createAsset) {
          errorMessage = query.data.createAsset.message
          status = parseInt(query.data.createAsset.code, 10)
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
