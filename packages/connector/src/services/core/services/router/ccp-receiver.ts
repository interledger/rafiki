import { isFulfill, isReject, deserializeIlpReply } from 'ilp-packet'
import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  serializeCcpRouteControlRequest,
  CcpRouteUpdateResponse
} from 'ilp-protocol-ccp'
import { IncomingRoute } from '../../../ilp-routing'
import { PeerNotFoundError } from '../../errors'
import debug from 'debug'
// Implementations SHOULD use a better logger than debug for production services
const log = debug('rafiki:ccp-receiver')

export class CcpReceiverService extends Map<string, CcpReceiver> {
  public getOrThrow(id: string): CcpReceiver {
    const receiver = this.get(id)
    if (!receiver) throw new PeerNotFoundError(id)
    return receiver
  }
}

export interface CcpReceiverOpts {
  peerId: string
  sendData: (packet: Buffer) => Promise<Buffer>
  addRoute: (route: IncomingRoute) => void
  removeRoute: (peerId: string, prefix: string) => void
  getRouteWeight: (peerId: string) => number
}

interface CcpReceiverStatus {
  routingTableId: string
  epoch: number
}

const ROUTE_CONTROL_RETRY_INTERVAL = 30000

// TODO: Pass the local routing table up to the peer
export class CcpReceiver {
  private _peerId: string
  private _sendData: (packet: Buffer) => Promise<Buffer>
  private _addRoute: (route: IncomingRoute) => void
  private _removeRoute: (peerId: string, prefix: string) => void
  private _getRouteWeight: (peerId: string) => number
  private _expiry = 0

  /**
   * Current routing table id used by our peer.
   *
   * We'll reset our epoch if this changes.
   */
  private _routingTableId = '00000000-0000-0000-0000-000000000000'

  /**
   * Epoch index up to which our peer has sent updates
   */
  private _epoch = 0

  constructor({
    peerId,
    sendData,
    addRoute,
    removeRoute,
    getRouteWeight
  }: CcpReceiverOpts) {
    this._peerId = peerId
    this._sendData = sendData
    this._addRoute = addRoute
    this._removeRoute = removeRoute
    this._getRouteWeight = getRouteWeight
    const interval = setInterval(async () => {
      await this._maybeSendRouteControl()
    }, 20 * 1000)
    interval.unref()
  }

  public getStatus(): CcpReceiverStatus {
    return {
      routingTableId: this._routingTableId,
      epoch: this._epoch
    }
  }

  public async handleRouteUpdate({
    routingTableId,
    fromEpochIndex,
    toEpochIndex,
    holdDownTime,
    newRoutes,
    withdrawnRoutes
  }: CcpRouteUpdateRequest): Promise<CcpRouteUpdateResponse> {
    this._bump(holdDownTime)

    if (this._routingTableId !== routingTableId) {
      log('saw new routing table.', {
        oldRoutingTableId: this._routingTableId,
        newRoutingTableId: routingTableId
      })
      this._routingTableId = routingTableId
      this._epoch = 0
    }

    if (fromEpochIndex > this._epoch) {
      // There is a gap, we need to go back to the last epoch we have
      log('gap in routing updates', {
        expectedEpoch: this._epoch,
        actualFromEpoch: fromEpochIndex
      })
      await this.sendRouteControl(true) // TODO: test
      return []
    }
    if (this._epoch > toEpochIndex) {
      // This routing update is older than what we already have
      log('old routing update, ignoring', {
        expectedEpoch: this._epoch,
        actualFromEpoch: toEpochIndex
      })
      return []
    }

    // just a heartbeat
    if (newRoutes.length === 0 && withdrawnRoutes.length === 0) {
      log('pure heartbeat.', {
        fromEpoch: fromEpochIndex,
        toEpoch: toEpochIndex
      })
      this._epoch = toEpochIndex
      return []
    }

    const changedPrefixes: string[] = []
    if (withdrawnRoutes.length > 0) {
      log('received withdrawn routes', { routes: withdrawnRoutes })
      for (const prefix of withdrawnRoutes) {
        this._removeRoute(this._peerId, prefix)
      }
    }

    for (const route of newRoutes) {
      this._addRoute({
        peer: this._peerId,
        prefix: route.prefix,
        path: route.path,
        weight: this._getRouteWeight(this._peerId)
      })
    }

    this._epoch = toEpochIndex

    log('applied route update', {
      count: changedPrefixes.length,
      fromEpoch: fromEpochIndex,
      toEpoch: toEpochIndex
    })

    return {} as CcpRouteUpdateResponse
  }

  public async sendRouteControl(sendOnce = false): Promise<void> {
    const routeControl: CcpRouteControlRequest = {
      mode: Mode.MODE_SYNC,
      lastKnownRoutingTableId: this._routingTableId,
      lastKnownEpoch: this._epoch,
      features: []
    }
    log('Sending Route Control message')

    try {
      const data = await this._sendData(
        serializeCcpRouteControlRequest(routeControl)
      )
      const packet = deserializeIlpReply(data)
      if (isFulfill(packet)) {
        log('successfully sent route control message.')
      } else if (isReject(packet)) {
        log('route control message was rejected.')
        throw new Error('route control message rejected.')
      } else {
        log('unknown response packet type')
        throw new Error('route control message returned unknown response.')
      }
    } catch (err) {
      const errInfo = err instanceof Object && err.stack ? err.stack : err
      log('failed to set route control information on peer', { error: errInfo })
      // TODO: Should have more elegant, thought-through retry logic here
      if (!sendOnce) {
        const retryTimeout = setTimeout(
          this.sendRouteControl,
          ROUTE_CONTROL_RETRY_INTERVAL
        )
        retryTimeout.unref()
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _bump(holdDownTime: number): void {
    // TODO: Should this be now() + holdDownTime?
    this._expiry = Date.now()
  }

  private async _maybeSendRouteControl(): Promise<void> {
    log('Checking if need to send new route control')
    if (Date.now() - this._expiry > 60 * 1000) {
      await this.sendRouteControl(true)
    }
  }
}
