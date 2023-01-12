import styles from '../styles/dist/Form.css'
import {
  Form,
  Link,
  useActionData,
  useTransition as useNavigation
} from '@remix-run/react'

function NewPeer() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const actionData = useActionData()
  console.log(actionData)
  return (
    <Form method='post' id='peer-form'>
      <span>
        <label htmlFor='ilp-address'>Static ILP address</label>
        <div>
          <input
            className={
              actionData?.formErrors?.staticIlpAddress ? 'input-error' : 'input'
            }
            type='text'
            id='ilp-address'
            name='staticIlpAddress'
            required
          />
          {actionData?.formErrors?.staticIlpAddress ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.staticIlpAddress}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='incoming-auth-tokens'>Incoming HTTP auth tokens</label>
        <div>
          <input
            className={
              actionData?.formErrors?.incomingAuthTokens
                ? 'input-error'
                : 'input'
            }
            type='text'
            id='incoming-auth-tokens'
            name='incomingAuthTokens'
          />
          {actionData?.formErrors?.incomingAuthTokens ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.incomingAuthTokens}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-auth-token'>Outgoing HTTP auth token</label>
        <div>
          {/* TODO: soon it will only be required for either incoming HTTP fields or outgoing HTTP fileds to be filled */}
          <input
            className={
              actionData?.formErrors?.outgoingAuthToken
                ? 'input-error'
                : 'input'
            }
            type='text'
            id='outgoing-auth-token'
            name='outgoingAuthToken'
            required
          />
          {actionData?.formErrors?.outgoingAuthToken ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.outgoingAuthToken}
            </p>
          ) : null}
        </div>
      </span>
      <span>
        <label htmlFor='outgoing-endpoint'>Outgoing HTTP endpoint</label>
        <div>
          <input
            className={
              actionData?.formErrors?.outgoingEndpoint ? 'input-error' : 'input'
            }
            type='text'
            id='outgoing-endpoint'
            name='outgoingEndpoint'
            required
          />
          {actionData?.formErrors?.outgoingEndpoint ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.outgoingEndpoint}
            </p>
          ) : null}
        </div>
      </span>
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
        <label htmlFor='max-pckt-amount'>Max packet amount</label>
        <div>
          <input
            className={
              actionData?.formErrors?.maxPacketAmount ? 'input-error' : 'input'
            }
            type='number'
            id='max-pckt-amount'
            name='maxPacketAmount'
          />
          {actionData?.formErrors?.maxPacketAmount ? (
            <p style={{ color: 'red' }}>
              {actionData?.formErrors?.maxPacketAmount}
            </p>
          ) : null}
        </div>
      </span>
      <div className='bottom-buttons form-actions'>
        <Link to='/peers'>
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

export default NewPeer

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
