import styles from '../styles/dist/DisplayItems.css'
import { Link } from '@remix-run/react'
import type { Asset } from '../../../backend/src/graphql/generated/graphql'

function DisplayAssets({ assets }: { assets: Asset[] }) {
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
              <tr key={asset.id}>
                <td>
                  <Link to={asset.id}>{asset.id}</Link>
                </td>
                <td>{asset.code}</td>
                <td>{asset.scale}</td>
                <td>
                  {asset.withdrawalThreshold
                    ? asset.withdrawalThreshold
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
