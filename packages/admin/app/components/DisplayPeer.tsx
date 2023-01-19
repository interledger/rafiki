import styles from '../styles/dist/DisplayItem.css'
import { Link } from '@remix-run/react'
import type { Peer } from '../../generated/graphql'

function DisplayPeer({ peer }: { peer: Peer }) {
  return (
    <table>
      <tbody>
        {peer.name ? (
          <tr>
            <th>Name</th>
            <td>{peer.name}</td>
          </tr>
        ) : null}
        <tr>
          <th>ID</th>
          <td>{peer.id}</td>
        </tr>
        <tr>
          <th>Static ILP address</th>
          <td>{peer.staticIlpAddress}</td>
        </tr>
        <tr>
          <th>
            <Link to={'/assets/' + peer.asset.id}>
              Asset
              <ul>
                <li>Code</li>
                <li>Scale</li>
              </ul>
            </Link>
          </th>
          <td>
            <Link to={'/assets/' + peer.asset.id}>
              <br></br>
              <ul className='values'>
                <li>{peer.asset.code}</li>
                <li>{peer.asset.scale}</li>
              </ul>
            </Link>
          </td>
        </tr>
        <tr>
          <th>
            Outgoing
            <ul>
              <li>HTTP endpoint</li>
              <li>HTTP auth token</li>
            </ul>
          </th>
          <td>
            <br></br>
            <ul className='values'>
              <li>{peer.http.outgoing.endpoint}</li>
              <li>{peer.http.outgoing.authToken}</li>
            </ul>
          </td>
        </tr>
        <tr>
          <th>Created at</th>
          <td>{peer.createdAt}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default DisplayPeer

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
