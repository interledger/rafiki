import { apolloClient } from '~/lib/apollo.server'
import { PeerService } from './peer.server'
import { AssetService } from './asset.server'

export const peerService = new PeerService(apolloClient)
export const assetService = new AssetService(apolloClient)
