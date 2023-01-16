import styles from '../styles/dist/DisplayItem.css'
import { useLoaderData } from '@remix-run/react'

function DisplayAsset() {
  const { asset } = useLoaderData()
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
