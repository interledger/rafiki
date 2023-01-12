import { redirect } from '@remix-run/node'

export default () => null

// Currently there is no home page, so we simply redirect to the Peers page immediately.
export const loader = () => redirect('/peers')
