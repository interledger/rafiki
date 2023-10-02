import PrefixMap from '../lib/prefix-map'
import { Route } from '../types/routing'
import { uuid } from '../lib/utils'

export interface RouteUpdate {
  epoch: number
  prefix: string
  route?: Route
}

export default class ForwardingRoutingTable extends PrefixMap<RouteUpdate> {
  public routingTableId: string = uuid()
  public log: (RouteUpdate | null)[] = []
  public currentEpoch = 0 // Superfluous? As the log length is analogous to the epoch it seems.
}
