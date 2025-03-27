import { AssetService } from '../../../asset/service'
import { IAppConfig } from '../../../config/app'
import { isPeerError, PeerError } from '../peer/errors'
import { PeerService } from '../peer/service'
import { BaseService } from '../../../shared/baseService'
import { AutoPeeringError, isAutoPeeringError } from './errors'
import { v4 as uuid } from 'uuid'
import { Peer } from '../peer/model'
import { AxiosInstance, isAxiosError } from 'axios'
import { isTransferError } from '../../../accounting/errors'

export interface PeeringDetails {
  staticIlpAddress: string
  ilpConnectorUrl: string
  httpToken: string
  name: string
  tenantId: string
}

export interface InitiatePeeringRequestArgs {
  peerUrl: string
  assetId: string
  name?: string
  maxPacketAmount?: bigint
  liquidityToDeposit?: bigint
  liquidityThreshold?: bigint
  tenantId: string
}

export interface PeeringRequestArgs {
  staticIlpAddress: string
  ilpConnectorUrl: string
  asset: { code: string; scale: number }
  httpToken: string
  maxPacketAmount?: number
  name?: string
  tenantId?: string
}

interface UpdatePeerArgs {
  staticIlpAddress: string
  ilpConnectorUrl: string
  assetId: string
  incomingHttpToken: string
  outgoingHttpToken: string
  maxPacketAmount?: number
  name?: string
  tenantId: string
}

interface DepositLiquidityArgs {
  peer: Peer
  amount: bigint
}

export interface AutoPeeringService {
  acceptPeeringRequest(
    args: PeeringRequestArgs
  ): Promise<PeeringDetails | AutoPeeringError>
  initiatePeeringRequest(
    args: InitiatePeeringRequestArgs
  ): Promise<Peer | AutoPeeringError>
}

export interface ServiceDependencies extends BaseService {
  axios: AxiosInstance
  assetService: AssetService
  peerService: PeerService
  config: IAppConfig
}

export async function createAutoPeeringService(
  deps_: ServiceDependencies
): Promise<AutoPeeringService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'AutoPeeringService'
    })
  }

  return {
    acceptPeeringRequest: (args) => acceptPeeringRequest(deps, args),
    initiatePeeringRequest: (args) => initiatePeeringRequest(deps, args)
  }
}

async function initiatePeeringRequest(
  deps: ServiceDependencies,
  args: InitiatePeeringRequestArgs
): Promise<Peer | AutoPeeringError> {
  const { peerUrl } = args

  const asset = await deps.assetService.get(args.assetId)

  if (!asset) {
    return AutoPeeringError.UnknownAsset
  }

  const outgoingHttpToken = uuid()

  const peeringDetailsOrError = await sendPeeringRequest(deps, peerUrl, {
    ilpConnectorUrl: deps.config.ilpConnectorUrl,
    staticIlpAddress: deps.config.ilpAddress,
    asset: { code: asset.code, scale: asset.scale },
    httpToken: outgoingHttpToken,
    maxPacketAmount: Number(args.maxPacketAmount),
    name: deps.config.instanceName
  })

  if (isAutoPeeringError(peeringDetailsOrError)) {
    return peeringDetailsOrError
  }

  const createdPeerOrError = await deps.peerService.create({
    maxPacketAmount: args.maxPacketAmount,
    name: args.name ?? peeringDetailsOrError.name,
    assetId: asset.id,
    liquidityThreshold: args.liquidityThreshold,
    staticIlpAddress: peeringDetailsOrError.staticIlpAddress,
    http: {
      incoming: {
        authTokens: [peeringDetailsOrError.httpToken]
      },
      outgoing: {
        authToken: outgoingHttpToken,
        endpoint: peeringDetailsOrError.ilpConnectorUrl
      }
    },
    tenantId: args.tenantId
  })

  const isDuplicatePeer =
    isPeerError(createdPeerOrError) &&
    createdPeerOrError === PeerError.DuplicatePeer

  const peerOrError = isDuplicatePeer
    ? await updatePeer(deps, {
        maxPacketAmount: args.maxPacketAmount
          ? Number(args.maxPacketAmount)
          : undefined,
        name: args.name ?? peeringDetailsOrError.name,
        staticIlpAddress: peeringDetailsOrError.staticIlpAddress,
        assetId: asset.id,
        outgoingHttpToken,
        incomingHttpToken: peeringDetailsOrError.httpToken,
        ilpConnectorUrl: peeringDetailsOrError.ilpConnectorUrl,
        tenantId: args.tenantId
      })
    : createdPeerOrError

  if (isPeerError(peerOrError)) {
    return handlePeerError(deps, peerOrError, 'Could not create or update peer')
  }

  return args.liquidityToDeposit
    ? await depositLiquidity(deps, {
        peer: peerOrError,
        amount: args.liquidityToDeposit
      })
    : peerOrError
}

async function depositLiquidity(
  deps: ServiceDependencies,
  args: DepositLiquidityArgs
): Promise<Peer | AutoPeeringError.LiquidityError> {
  const transferOrPeerError = await deps.peerService.depositLiquidity({
    peerId: args.peer.id,
    amount: args.amount,
    tenantId: args.peer.tenantId
  })

  if (
    isTransferError(transferOrPeerError) ||
    isPeerError(transferOrPeerError)
  ) {
    deps.logger.error(
      { err: transferOrPeerError, args, peerId: args.peer.id },
      'Could not deposit liquidity to peer'
    )

    return AutoPeeringError.LiquidityError
  }

  return args.peer
}

async function sendPeeringRequest(
  deps: ServiceDependencies,
  peerUrl: string,
  args: PeeringRequestArgs
): Promise<PeeringDetails | AutoPeeringError> {
  try {
    const { data: peeringDetails }: { data: PeeringDetails } =
      await deps.axios.post(peerUrl, args)

    return peeringDetails
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return AutoPeeringError.InvalidPeerUrl
      }

      const errorType = error.response?.data?.error?.type
      if (errorType === AutoPeeringError.InvalidPeerIlpConfiguration) {
        return AutoPeeringError.InvalidIlpConfiguration
      } else if (errorType === AutoPeeringError.UnknownAsset) {
        return AutoPeeringError.PeerUnsupportedAsset
      }
    }

    deps.logger.error(
      {
        errorMessage:
          error instanceof Error && error.message ? error.message : error
      },
      'error when making peering request'
    )

    return AutoPeeringError.InvalidPeeringRequest
  }
}

async function acceptPeeringRequest(
  deps: ServiceDependencies,
  args: PeeringRequestArgs
): Promise<PeeringDetails | AutoPeeringError> {
  const assets = await deps.assetService.getAll()

  const asset = assets.find(
    ({ code, scale }) => code === args.asset.code && scale === args.asset.scale
  )

  if (!asset) {
    return AutoPeeringError.UnknownAsset
  }

  const outgoingHttpToken = uuid()

  const createdPeerOrError = await deps.peerService.create({
    maxPacketAmount: args.maxPacketAmount
      ? BigInt(args.maxPacketAmount)
      : undefined,
    name: args.name,
    staticIlpAddress: args.staticIlpAddress,
    assetId: asset.id,
    http: {
      incoming: {
        authTokens: [args.httpToken]
      },
      outgoing: {
        endpoint: args.ilpConnectorUrl,
        authToken: outgoingHttpToken
      }
    },
    initialLiquidity: BigInt(Number.MAX_SAFE_INTEGER),
    tenantId: deps.config.operatorTenantId
  })

  const isDuplicatePeeringRequest =
    isPeerError(createdPeerOrError) &&
    createdPeerOrError === PeerError.DuplicatePeer

  const peerOrError = isDuplicatePeeringRequest
    ? await updatePeer(deps, {
        maxPacketAmount: args.maxPacketAmount,
        name: args.name,
        staticIlpAddress: args.staticIlpAddress,
        assetId: asset.id,
        outgoingHttpToken,
        incomingHttpToken: args.httpToken,
        ilpConnectorUrl: args.ilpConnectorUrl,
        tenantId: deps.config.operatorTenantId
      })
    : createdPeerOrError

  if (isPeerError(peerOrError)) {
    return handlePeerError(
      deps,
      peerOrError,
      'Could not accept peering request'
    )
  }

  return {
    ilpConnectorUrl: deps.config.ilpConnectorUrl,
    staticIlpAddress: deps.config.ilpAddress,
    httpToken: peerOrError.http.outgoing.authToken,
    name: deps.config.instanceName,
    tenantId: peerOrError.tenantId
  }
}

async function updatePeer(
  deps: ServiceDependencies,
  args: UpdatePeerArgs
): Promise<Peer | PeerError> {
  const peer = await deps.peerService.getByDestinationAddress(
    args.staticIlpAddress,
    args.tenantId,
    args.assetId
  )

  if (!peer) {
    deps.logger.error({ request: args }, 'could not find peer by ILP address')
    return PeerError.UnknownPeer
  }

  return deps.peerService.update({
    id: peer.id,
    maxPacketAmount: args.maxPacketAmount
      ? BigInt(args.maxPacketAmount)
      : undefined,
    name: args.name,
    http: {
      incoming: { authTokens: [args.incomingHttpToken] },
      outgoing: {
        authToken: args.outgoingHttpToken,
        endpoint: args.ilpConnectorUrl
      }
    },
    tenantId: args.tenantId
  })
}

function handlePeerError(
  deps: ServiceDependencies,
  peerError: PeerError,
  logMessage: string
): AutoPeeringError {
  if (
    peerError === PeerError.InvalidHTTPEndpoint ||
    peerError === PeerError.InvalidStaticIlpAddress
  ) {
    return AutoPeeringError.InvalidPeerIlpConfiguration
  } else {
    deps.logger.error({ err: peerError }, logMessage)
    return AutoPeeringError.InvalidPeeringRequest
  }
}
