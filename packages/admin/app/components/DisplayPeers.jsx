import styles from '../styles/dist/DisplayItems.css'
import { Link } from '@remix-run/react'
import * as R from 'ramda'

function DisplayPeers({ peers }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Peer ID</th>
          <th>Static ILP address</th>
          <th>Asset code</th>
          <th>Asset scale</th>
          <th>Outgoing endpoint</th>
        </tr>
      </thead>
      <tbody>
        {peers.length
          ? peers.map((peer) => (
              <tr key={R.path(['node', 'id'], peer)}>
                <td>
                  <Link to={R.path(['node', 'id'], peer)}>
                    {R.path(['node', 'id'], peer)}
                  </Link>
                </td>
                <td>{R.path(['node', 'staticIlpAddress'], peer)}</td>
                <td>{R.path(['node', 'asset', 'code'], peer)}</td>
                <td>{R.path(['node', 'asset', 'scale'], peer)}</td>
                <td>
                  {R.path(['node', 'http', 'outgoing', 'endpoint'], peer)}
                </td>
              </tr>
            ))
          : ''}
      </tbody>
    </table>
  )
}

export default DisplayPeers

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
