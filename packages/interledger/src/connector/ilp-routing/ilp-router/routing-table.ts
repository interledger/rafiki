import PrefixMap from '../lib/prefix-map'
import { Route } from '../types/routing'

export default class RoutingTable extends PrefixMap<Route> {}
