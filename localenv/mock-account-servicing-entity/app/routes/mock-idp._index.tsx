import ConsentScreen from '~/routes/consent-screen'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { CONFIG } from '~/lib/parse_config.server'

export function loader() {
  return json({ idpSecret: CONFIG.idpSecret })
}

export default function Index() {
  const { idpSecret } = useLoaderData<typeof loader>()
  return <ConsentScreen idpSecret={idpSecret} />
}
