import styles from '../styles/dist/Form.css'
import {
  Form,
  Link,
  useActionData,
  useTransition as useNavigation
} from '@remix-run/react'

function NewAsset() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const actionData = useActionData()
  return (
    <Form method='post' id='asset-form'>
      <span>
        <label htmlFor='asset-code'>Asset code</label>
        <div>
          <input
            className={
              actionData?.formErrors?.assetCode ? 'input-error' : 'input'
            }
            type='text'
            id='asset-code'
            name='assetCode'
            required
          />
          {actionData?.formErrors?.assetCode ? (
            <p style={{ color: 'red' }}>{actionData?.formErrors?.assetCode}</p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='asset-scale'>Asset scale</label>
        <div>
          <input
            className={
              actionData?.formErrors?.assetScale ? 'input-error' : 'input'
            }
            type='number'
            id='asset-scale'
            name='assetScale'
            required
          />
          {actionData?.formErrors?.assetScale ? (
            <p style={{ color: 'red' }}>{actionData?.formErrors?.assetScale}</p>
          ) : null}
        </div>
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
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Form>
  )
}

export default NewAsset

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
