import MockIdpFrontend from '~/mock-idp-frontend'

export default function Index() {
  return <MockIdpFrontend />
}

export function links() {
  return [{ rel: 'stylesheet', href: tableStyle }]
}
