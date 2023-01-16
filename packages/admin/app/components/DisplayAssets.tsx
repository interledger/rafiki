import styles from '../styles/dist/DisplayItems.css'
import { Link } from '@remix-run/react'
import * as R from 'ramda'

function DisplayAssets({ assets }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Asset ID</th>
          <th>Code</th>
          <th>Scale</th>
          <th>Withdrawl threshold</th>
        </tr>
      </thead>
      <tbody>
        {assets.length
          ? assets.map((asset) => (
              <tr key={R.path(['node', 'id'], asset)}>
                <td>
                  <Link to={R.path(['node', 'id'], asset)}>
                    {R.path(['node', 'id'], asset)}
                  </Link>
                </td>
                <td>{R.path(['node', 'code'], asset)}</td>
                <td>{R.path(['node', 'scale'], asset)}</td>
                <td>
                  {R.path(['node', 'withdrawalThreshold'], asset)
                    ? R.path(['node', 'withdrawalThreshold'], asset)
                    : 'null'}
                </td>
              </tr>
            ))
          : ''}
      </tbody>
    </table>
  )
}

export default DisplayAssets

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
