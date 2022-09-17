
import ConsentScreen from '~/consent-screen'

export default function Index() {
  return (
    <ConsentScreen />
  )
}

export function links() {
  return [{ rel: 'stylesheet', href: tableStyle }]
}
