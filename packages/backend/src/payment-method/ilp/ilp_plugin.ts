import { ConnectorAccount } from './connector/core'

// Maybe @interledger/pay should export this interface.
export interface IlpPlugin {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isConnected: () => boolean
  sendData: (data: Buffer) => Promise<Buffer>
  registerDataHandler: (handler: (data: Buffer) => Promise<Buffer>) => void
  deregisterDataHandler: () => void
}

export function createIlpPlugin(
  sendData: (data: Buffer) => Promise<Buffer>
): OutgoingIlpPlugin {
  return new OutgoingIlpPlugin(sendData)
}

export class OutgoingIlpPlugin implements IlpPlugin {
  constructor(private _sendData: (data: Buffer) => Promise<Buffer>) {}

  sendData(data: Buffer): Promise<Buffer> {
    return this._sendData(data)
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async connect(): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async disconnect(): Promise<void> {}
  isConnected(): boolean {
    return true
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  registerDataHandler(_handler: (data: Buffer) => Promise<Buffer>): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deregisterDataHandler(): void {}
}

export interface IlpPluginOptions {
  sourceAccount: ConnectorAccount
  unfulfillable?: boolean
}
