import styles from '../styles/dist/DisplayItem.css'
import { useLoaderData, Link } from '@remix-run/react'

function DisplayPeers() {
  const { peer } = useLoaderData()

  return (
    <table>
      <tbody>
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
          <th>Outgoing endpoint</th>
          <td>{peer.http.outgoing.endpoint}</td>
        </tr>
        <tr>
          <th>Created at</th>
          <td>{new Date(peer.createdAt).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default DisplayPeers

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
