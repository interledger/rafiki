import styles from '../styles/dist/Form.css'
import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  useTransition as useNavigation
} from '@remix-run/react'

function UpdateAsset() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const { asset } = useLoaderData()
  const actionData = useActionData()
  return (
    <Form method='post' id='asset-form'>
      <span>
        {actionData?.formErrors?.assetId ? (
          <label htmlFor='asset-id'>Asset ID</label>
        ) : null}
        <div>
          {/* hidden form field to pass back asset id */}
          <input
            className={
              actionData?.formErrors?.assetId ? 'input-error' : 'input'
            }
            type={actionData?.formErrors?.assetId ? 'text' : 'hidden'}
            id='asset-id'
            name='assetId'
            value={asset.id}
          />
          {actionData?.formErrors?.assetId ? (
            <p style={{ color: 'red' }}>{actionData?.formErrors?.assetId}</p>
          ) : null}
        </div>
      </span>
      <span
        style={
          actionData?.formErrors?.assetId
            ? { display: 'none' }
            : { display: 'in-line' }
        }
      >
        <label htmlFor='asset-id'>Asset ID</label>
        <p>{asset.id}</p>
      </span>
      <span>
        <label htmlFor='asset-code'>Asset code</label>
        <p>{asset.code}</p>
      </span>
      <span>
        <label htmlFor='asset-scale'>Asset scale</label>
        <p>{asset.scale}</p>
      </span>
      <span>
        <label htmlFor='withdrawal-threshold'>Withdrawl threshold</label>
        <div>
          <input
            className={
              actionData?.formErrors?.withdrawalThreshold
                ? 'input-error'
                : 'input'
            }
            type='number'
            id='withdrawal-threshold'
            name='withdrawalThreshold'
            defaultValue={asset.withdrawalThreshold}
          />
          {actionData?.formErrors?.withdrawalThreshold ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.withdrawalThreshold}
            </p>
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

export default UpdateAsset

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
