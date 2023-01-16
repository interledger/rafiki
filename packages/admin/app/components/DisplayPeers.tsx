import styles from '../styles/dist/DisplayItems.css'
import { Link } from '@remix-run/react'
import type { Peer } from '../../../backend/src/graphql/generated/graphql'

function DisplayPeers({ peers }: {peers: Peer[]}) {
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
              <tr key={peer.id}>
                <td>
                  <Link to={peer.id}>
                    {peer.id}
                  </Link>
                </td>
                <td>{peer.staticIlpAddress}</td>
                <td>{peer.asset.code}</td>
                <td>{peer.asset.scale}</td>
                <td>
                  {peer.http.outgoing.endpoint}
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
