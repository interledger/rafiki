import base64url from 'base64url'
import { IlpAddress } from 'ilp-packet'
import { StreamServer } from '@interledger/stream-receiver'

import { BaseService } from '../../shared/baseService'
import { IncomingPayment } from '../payment/incoming/model'

export type ConnectionJSON = {
  id: string
  ilpAddress: IlpAddress
  sharedSecret: string
  assetCode: string
  assetScale: number
}

export class Connection {
  public constructor(
    public readonly id: string,
    public readonly ilpAddress: IlpAddress,
    public readonly sharedSecret: Buffer,
    public readonly assetCode: string,
    public readonly assetScale: number,
    private readonly openPaymentsUrl: string
  ) {}

  public get url(): string {
    return `${this.openPaymentsUrl}/connections/${this.id}`
  }

  public toJSON(): ConnectionJSON {
    return {
      id: this.url,
      ilpAddress: this.ilpAddress,
      sharedSecret: base64url(this.sharedSecret),
      assetCode: this.assetCode,
      assetScale: this.assetScale
    }
  }
}

export interface ConnectionService {
  get(payment: IncomingPayment): Connection | undefined
  getUrl(payment: IncomingPayment): string | undefined
}

export interface ServiceDependencies extends BaseService {
  openPaymentsUrl: string
  streamServer: StreamServer
}

export async function createConnectionService(
  deps_: ServiceDependencies
): Promise<ConnectionService> {
  const log = deps_.logger.child({
    service: 'ConnectionService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    get: (payment) => getConnection(deps, payment),
    getUrl: (payment) => getConnectionUrl(deps, payment)
  }
}

function getConnection(
  deps: ServiceDependencies,
  payment: IncomingPayment
): Connection | undefined {
  if (!payment.connectionId) {
    return undefined
  }
  const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
    paymentTag: payment.id,
    asset: {
      code: payment.asset.code,
      scale: payment.asset.scale
    }
  })
  return new Connection(
    payment.connectionId,
    ilpAddress,
    sharedSecret,
    payment.asset.code,
    payment.asset.scale,
    deps.openPaymentsUrl
  )
}

function getConnectionUrl(
  deps: ServiceDependencies,
  payment: IncomingPayment
): string | undefined {
  if (!payment.connectionId) {
    return undefined
  }
  return `${deps.openPaymentsUrl}/connections/${payment.connectionId}`
}
