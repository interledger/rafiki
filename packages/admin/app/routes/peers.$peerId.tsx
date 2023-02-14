import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { peerService } from '~/services/bootstrap.server'
import { obscureAuthToken } from '../lib/utils.server'

export default function ViewPeerPage() {
  const peer = useLoaderData<typeof loader>()

  return <>{JSON.stringify(peer, null, 2)}</>
}

export async function loader({ params }: LoaderArgs) {
  const peerId = params.peerId

  const result = z.string().uuid().safeParse(peerId)
  if (!result.success) {
    throw new Error('Invalid peer ID.')
  }

  const peer = await peerService.get({ id: result.data })

  if (!peer) {
    throw new Error('Peer not found')
  }

  peer.http.outgoing.authToken = obscureAuthToken(peer?.http.outgoing.authToken)

  return json(peer)
}
