import styles from '../styles/dist/DisplayItem.css'
import type { Asset } from '../generated/graphql'

function DisplayAsset({ asset }: { asset: Asset }) {
  return (
    <table>
      <tbody>
        <tr>
          <th>ID</th>
          <td>{asset.id}</td>
        </tr>
        <tr>
          <th>Code</th>
          <td>{asset.code}</td>
        </tr>
        <tr>
          <th>Scale</th>
          <td>{asset.scale}</td>
        </tr>
        <tr>
          <th>Withdrawl threshold</th>
          <td>
            {asset.withdrawalThreshold ? asset.withdrawalThreshold : 'null'}
          </td>
        </tr>
        <tr>
          <th>Created at</th>
          <td>{new Date(asset.createdAt).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default DisplayAsset

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
