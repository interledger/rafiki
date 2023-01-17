import styles from '../styles/dist/Form.css'
import { Form, Link, useTransition as useNavigation } from '@remix-run/react'
import type { Peer } from '../../../backend/src/graphql/generated/graphql'

function UpdatePeer({ peer }: { peer: Peer }) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  return (
    <Form method='post' id='peer-form'>
      {/* hidden form field to pass back peer id */}
      <input type='hidden' name='peerId' value={peer.id} />
      <span>
        <label htmlFor='asset-id'>Peer ID</label>
        <p>{peer.id}</p>
      </span>
      <span>
        <label htmlFor='ilp-address'>Static ILP address</label>
        <input
          type='text'
          id='ilp-address'
          name='staticIlpAddress'
          defaultValue={peer.staticIlpAddress}
          required
        />
      </span>
      <span>
        <label htmlFor='incoming-auth-tokens'>Incoming HTTP auth tokens</label>
        <input
          type='text'
          id='incoming-auth-tokens'
          name='incomingAuthTokens'
        />
      </span>
      <span>
        <label htmlFor='outgoing-auth-token'>Outgoing HTTP auth token</label>
        <input
          type='text'
          id='outgoing-auth-token'
          name='outgoingAuthToken'
          required
        />
      </span>
      <span>
        <label htmlFor='outgoing-endpoint'>Outgoing HTTP endpoint</label>
        <input
          type='text'
          id='outgoing-endpoint'
          name='outgoingEndpoint'
          defaultValue={peer.http.outgoing.endpoint}
          required
        />
      </span>
      <span>
        <label htmlFor='asset-code'>Asset code</label>
        <p>{peer.asset.code}</p>
      </span>
      <span>
        <label htmlFor='asset-scale'>Asset scale</label>
        <p>{peer.asset.scale}</p>
      </span>
      <span>
        <label htmlFor='max-pckt-amount'>Max packet amount</label>
        <input
          type='number'
          id='max-pckt-amount'
          name='maxPacketAmount'
          defaultValue={peer.maxPacketAmount}
        />
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
          {isSubmitting ? 'Updating...' : 'Update'}
        </button>
      </div>
    </Form>
  )
}

export default UpdatePeer

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
