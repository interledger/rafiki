import axios from 'axios'
import { IlpPrepare, IlpReply, IlpFulfill, IlpReject } from 'ilp-packet'
import {
  LoggingService,
  STATIC_FULFILLMENT,
  DebugLogger
} from '@interledger/rafiki-core'
import { SettlementEngine, SettlementResponse } from '.'

export class RemoteSettlementEngine implements SettlementEngine {
  private _log: LoggingService
  constructor (private _url: string, log?: LoggingService) {
    this._log = log || new DebugLogger('InMemoryRouter')
  }

  async addAccount (accountId: string): Promise<void> {
    this._log.info(
      'Creating account on settlement engine for peer=' +
        accountId +
        ' endpoint:' +
        `${this._url}/accounts`
    )
    await axios
      .post(`${this._url}/accounts`, { accountId })
      .then(response => {
        this._log.info('Created account on settlement engine', {
          response: response.status
        })
      })
      .catch(error => {
        this._log.error(
          'Failed to create account on settlement engine. Retrying in 5s',
          { accountId, responseStatus: error.response.status }
        )
        const timeout = setTimeout(() => this.addAccount(accountId), 5000)
        timeout.unref()
      })
  }

  async removeAccount (accountId: string): Promise<void> {
    this._log.info('Removing account on settlement engine', { accountId })
    await axios.delete(`${this._url}/accounts/${accountId}`).catch(error => {
      console.log(
        'failed to delete account' + accountId,
        'url',
        `${this._url}/accounts/${accountId}`,
        'error',
        error
      )
      this._log.error('Failed to delete account on settlement engine', {
        accountId,
        responseStatus: error.response.status
      })
      throw error
    })
  }

  async receiveRequest (
    accountId: string,
    packet: IlpPrepare
  ): Promise<IlpReply> {
    this._log.debug('Forwarding packet onto settlement engine', {
      accountId,
      packet,
      url: `${this._url}/accounts/${accountId}/messages`
    })
    const bufferMessage = packet.data
    try {
      const response = await axios.post(
        `${this._url}/accounts/${accountId}/messages`,
        bufferMessage,
        {
          headers: { 'content-type': 'application/octet-stream' },
          responseType: 'arraybuffer'
        }
      )
      const ilpFulfill: IlpFulfill = {
        data: response.data || Buffer.from(''),
        fulfillment: STATIC_FULFILLMENT
      }
      return ilpFulfill
    } catch (error) {
      this._log.error('Could not deliver message to SE.', {
        errorStatus: error.status,
        errorMessage: error.message
      })
      const ilpReject: IlpReject = {
        code: 'F00',
        triggeredBy: 'peer.settle',
        data: Buffer.allocUnsafe(0),
        message: 'Failed to deliver message to SE'
      }
      return ilpReject
    }
  }

  async sendSettlement (
    accountId: string,
    amount: bigint,
    scale: number
  ): Promise<SettlementResponse> {
    this._log.debug('requesting SE to do settlement', {
      accountId,
      amount: amount.toString(),
      scale
    })
    const message = {
      amount: amount.toString(),
      scale
    }
    return axios
      .post(`${this._url}/accounts/${accountId}/settlement`, message)
      .then(resp => resp.data)
  }
}
