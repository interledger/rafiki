import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  ModeReverseMap,
  serializeCcpRouteUpdateRequest,
  CcpRouteControlResponse
} from 'ilp-protocol-ccp'
import {
  ForwardingRoutingTable,
  BroadcastRoute,
  Relation,
  RouteUpdate
} from '../../ilp-routing'
import { randomBytes } from 'crypto'
import { PeerNotFoundError } from '../../errors'
import debug from 'debug'
// Implementations SHOULD use a better logger than debug for production services
const log = debug('rafiki:ccp-sender')

export class CcpSenderService extends Map<string, CcpSender> {
  public getOrThrow (id: string): CcpSender {
    const sender = this.get(id)
    if (!sender) throw new PeerNotFoundError(id)
    return sender
  }
}

export interface CcpSenderOpts {
  peerId: string;
  sendData: (packet: Buffer) => Promise<Buffer>;
  getOwnAddress: () => string;
  routeExpiry: number;
  routeBroadcastInterval: number;
  forwardingRoutingTable: ForwardingRoutingTable;
  getPeerRelation: (accountId: string) => Relation;
}

interface CcpSenderStatus {
  epoch: number;
  mode: string;
}

const MINIMUM_UPDATE_INTERVAL = 150
const MAX_EPOCHS_PER_UPDATE = 50

export class CcpSender {
  private _forwardingRoutingTable: ForwardingRoutingTable
  private _getPeerRelation: (peerId: string) => Relation

  private _getOwnAddress: () => string
  private _mode: Mode = Mode.MODE_IDLE
  private _peerId: string
  private _sendData: (data: Buffer) => Promise<Buffer>
  private _routeExpiry: number
  private _routeBroadcastInterval: number

  /**
   * Next epoch that the peer requested from us.
   */
  private _lastKnownEpoch = 0
  private _lastUpdate = 0
  private _sendRouteUpdateTimer?: NodeJS.Timer

  constructor ({
    peerId,
    sendData,
    forwardingRoutingTable,
    getOwnAddress,
    getPeerRelation,
    routeExpiry,
    routeBroadcastInterval
  }: CcpSenderOpts) {
    this._forwardingRoutingTable = forwardingRoutingTable
    this._peerId = peerId
    this._sendData = sendData
    this._getOwnAddress = getOwnAddress
    this._getPeerRelation = getPeerRelation
    this._routeExpiry = routeExpiry
    this._routeBroadcastInterval = routeBroadcastInterval
  }

  public stop (): void {
    if (this._sendRouteUpdateTimer) {
      clearTimeout(this._sendRouteUpdateTimer)
    }
  }

  public getLastUpdate (): number {
    return this._lastUpdate
  }

  public getStatus (): CcpSenderStatus {
    return {
      epoch: this._lastKnownEpoch,
      mode: ModeReverseMap[this._mode]
    }
  }

  public async handleRouteControl ({
    mode,
    lastKnownRoutingTableId,
    lastKnownEpoch
  }: CcpRouteControlRequest): Promise<CcpRouteControlResponse> {
    if (this._mode !== mode) {
      log('peer requested changing routing mode', {
        oldMode: ModeReverseMap[this._mode],
        newMode: ModeReverseMap[mode]
      })
    }
    this._mode = mode

    if (
      lastKnownRoutingTableId !== this._forwardingRoutingTable.routingTableId
    ) {
      log('peer has old routing table id, resetting lastKnownEpoch to zero', {
        theirTableId: lastKnownRoutingTableId,
        correctTableId: this._forwardingRoutingTable.routingTableId
      })
      this._lastKnownEpoch = 0
    } else {
      log('peer epoch set', {
        peerId: this._peerId,
        lastKnownEpoch,
        epoch: this._forwardingRoutingTable.currentEpoch
      })
      this._lastKnownEpoch = lastKnownEpoch
    }

    // We don't support any optional features, so we ignore the `features`

    if (this._mode === Mode.MODE_SYNC) {
      // Start broadcasting routes to this peer
      this._scheduleRouteUpdate()
    } else {
      // Stop broadcasting routes to this peer
      if (this._sendRouteUpdateTimer) {
        clearTimeout(this._sendRouteUpdateTimer)
        this._sendRouteUpdateTimer = undefined
      }
    }
    return {} as CcpRouteControlResponse
  }

  private _scheduleRouteUpdate (): void {
    if (this._sendRouteUpdateTimer) {
      clearTimeout(this._sendRouteUpdateTimer)
      this._sendRouteUpdateTimer = undefined
    }

    if (this._mode !== Mode.MODE_SYNC) {
      return
    }

    const lastUpdate = this._lastUpdate
    const nextEpoch = this._lastKnownEpoch

    let delay: number
    if (nextEpoch < this._forwardingRoutingTable.currentEpoch) {
      delay = 0
    } else {
      delay = this._routeBroadcastInterval - (Date.now() - lastUpdate)
    }

    delay = Math.max(MINIMUM_UPDATE_INTERVAL, delay)

    log('scheduling next route update', {
      peerId: this._peerId,
      delay,
      currentEpoch: this._forwardingRoutingTable.currentEpoch,
      lastEpoch: this._lastKnownEpoch
    })
    this._sendRouteUpdateTimer = setTimeout(() => {
      this._sendSingleRouteUpdate()
        .then(() => this._scheduleRouteUpdate())
        .catch((err: any) => {
          const errInfo = err instanceof Object && err.stack ? err.stack : err
          log('failed to broadcast route information to peer', {
            peerId: this._peerId,
            error: errInfo
          })
        })
    }, delay)
    this._sendRouteUpdateTimer.unref()
  }

  private async _sendSingleRouteUpdate (): Promise<void> {
    this._lastUpdate = Date.now()

    const nextRequestedEpoch = this._lastKnownEpoch
    const allUpdates = this._forwardingRoutingTable.log.slice(
      nextRequestedEpoch,
      nextRequestedEpoch + MAX_EPOCHS_PER_UPDATE
    )

    const toEpoch = nextRequestedEpoch + allUpdates.length

    const relation = this._getPeerRelation(this._peerId)

    function isRouteUpdate (update: RouteUpdate | null): update is RouteUpdate {
      return !!update
    }

    const updates = allUpdates
      .filter(isRouteUpdate)
      .map((update: RouteUpdate) => {
        if (!update.route) return update

        if (
          // Don't send peer their own routes
          update.route.nextHop === this._peerId ||
          // Don't advertise peer and provider routes to providers
          (relation === 'parent' &&
            ['peer', 'parent'].indexOf(
              this._getPeerRelation(update.route.nextHop)
            ) !== -1)
        ) {
          return {
            ...update,
            route: undefined
          }
        } else {
          return update
        }
      })

    const newRoutes: BroadcastRoute[] = []
    const withdrawnRoutes: { prefix: string; epoch: number }[] = []

    for (const update of updates) {
      if (update.route) {
        newRoutes.push({
          prefix: update.prefix,
          nextHop: update.route.nextHop,
          path: update.route.path
        })
      } else {
        withdrawnRoutes.push({
          prefix: update.prefix,
          epoch: update.epoch
        })
      }
    }

    log('broadcasting routes to peer', {
      speaker: this._getOwnAddress(),
      peerId: this._peerId,
      fromEpoch: this._lastKnownEpoch,
      toEpoch: toEpoch,
      routeCount: newRoutes.length,
      unreachableCount: withdrawnRoutes.length
    })
    const auth = randomBytes(32) // TODO: temp for now
    const routeUpdate: CcpRouteUpdateRequest = {
      speaker: this._getOwnAddress(),
      routingTableId: this._forwardingRoutingTable.routingTableId,
      holdDownTime: this._routeExpiry,
      currentEpochIndex: this._forwardingRoutingTable.currentEpoch,
      fromEpochIndex: this._lastKnownEpoch,
      toEpochIndex: toEpoch,
      newRoutes: newRoutes.map(r => ({
        ...r,
        nextHop: undefined,
        auth,
        props: []
      })),
      withdrawnRoutes: withdrawnRoutes.map(r => r.prefix)
    }

    // We anticipate that they're going to be happy with our route update and
    // request the next one.
    const previousNextRequestedEpoch = this._lastKnownEpoch
    this._lastKnownEpoch = toEpoch

    const timeout = this._routeBroadcastInterval

    const timerPromise: Promise<Buffer> = new Promise(
      (resolve, reject): void => {
        const timer = setTimeout(
          () => reject(new Error('route update timed out.')),
          timeout
        )
        // Don't let this timer keep Node running
        timer.unref()
      }
    )

    try {
      await Promise.race([
        this._sendData(serializeCcpRouteUpdateRequest(routeUpdate)),
        timerPromise
      ])
    } catch (err) {
      log('failed to send route update to peer', { peerId: this._peerId })
      this._lastKnownEpoch = previousNextRequestedEpoch
      throw err
    }
  }
}
