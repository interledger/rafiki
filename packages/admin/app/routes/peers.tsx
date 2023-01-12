import { Outlet } from '@remix-run/react'
import styles from '../styles/dist/main.css'

export default function PeersBasePage() {
  return <Outlet />
}

export function links() {
  return [{ rel: 'stylesheet', href: styles }]
}
