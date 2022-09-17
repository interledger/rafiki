import { Response } from '@remix-run/node'

export function loader() {
  return new Response('fake client done')
}
