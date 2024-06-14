import ConsentScreen from '~/routes/mock-idp._index'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { CONFIG } from '~/lib/parse_config.server'

export function loader() {
  return json({ idpSecret: CONFIG.idpSecret })
}

export default function Index() {
  const { idpSecret } = useLoaderData<typeof loader>()
  return <ConsentScreen idpSecretParam={idpSecret} /> // In production, ensure that secrets are handled securely and are not exposed to the client-side code.
}
