import { NotFoundError } from 'objection'
import { IAppConfig } from '../../config/app'
import { BaseService } from '../../shared/baseService'
import { Merchant } from '../model'
import { PosDeviceError } from './errors'
import { DeviceStatus, PosDevice } from './model'
import { v4 as uuid } from 'uuid'

export interface PosDeviceService {
  registerDevice(options: CreateOptions): Promise<PosDevice | PosDeviceError>

  getByKeyId(keyId: string): Promise<PosDevice | void>

  revoke(id: string): Promise<PosDevice | PosDeviceError>
}

export interface CreateOptions {
  merchantId: string
  publicKey: string
  deviceName: string
  walletAddress: string
  algorithm: string
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
}

export async function createPosDeviceService({
  config,
  logger,
  knex
}: ServiceDependencies): Promise<PosDeviceService> {
  const log = logger.child({
    service: 'PosDeviceService'
  })
  const deps: ServiceDependencies = {
    config,
    logger: log,
    knex
  }

  return {
    registerDevice: (options) => registerDevice(deps, options),
    getByKeyId: (keyId) => getByKeyId(deps, keyId),
    revoke: (id) => revoke(deps, id)
  }
}

async function registerDevice(
  deps: ServiceDependencies,
  { merchantId, publicKey, deviceName, walletAddress, algorithm }: CreateOptions
): Promise<PosDevice | PosDeviceError> {
  const merchant = await Merchant.query(deps.knex).findById(merchantId)
  if (!merchant) {
    return PosDeviceError.UnknownMerchant
  }

  const device = await PosDevice.query(deps.knex).insertAndFetch({
    walletAddress,
    merchantId,
    publicKey,
    deviceName,
    status: DeviceStatus.Active,
    keyId: generateKeyId(deviceName),
    algorithm
  })
  return device
}

async function getByKeyId(
  deps: ServiceDependencies,
  keyId: string
): Promise<PosDevice | void> {
  const device = await PosDevice.query(deps.knex)
    .where({
      keyId
    })
    .first()
  return device
}

async function revoke(
  deps: ServiceDependencies,
  id: string
): Promise<PosDevice | PosDeviceError> {
  try {
    const device = await PosDevice.query(deps.knex)
      .patchAndFetchById(id, {
        status: DeviceStatus.Revoked,
        deletedAt: new Date()
      })
      .throwIfNotFound()
    return device
  } catch (err) {
    if (err instanceof NotFoundError) {
      return PosDeviceError.UnknownPosDevice
    }
    throw err
  }
}

function generateKeyId(deviceName: string): string {
  const deviceNameTrimmed = deviceName.replace(/\s/g, '')
  const PREFIX = 'pos:'
  const MAX_LENGTH = 6
  const TOTAL_LENGTH = 12
  if (deviceNameTrimmed.length < MAX_LENGTH) {
    // if the name has less than 6 chars, we'll generate extra missing chars to maintain length
    const uuidPartLength = TOTAL_LENGTH - deviceNameTrimmed.length
    return `${PREFIX}${deviceNameTrimmed}${uuid().substring(0, uuidPartLength)}`
  }
  return `${PREFIX}${deviceNameTrimmed.substring(0, MAX_LENGTH)}${uuid().substring(0, MAX_LENGTH)}`
}
