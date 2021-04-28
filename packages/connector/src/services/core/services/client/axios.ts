import { Client } from '.'
import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
//import Agent from 'agentkeepalive'

export class AxiosClient implements Client {
  readonly axiosInstance: AxiosInstance
  //readonly keepAliveAgent: Agent

  constructor(private _url: string, private _config: AxiosRequestConfig) {
    this.axiosInstance = Axios.create({
      baseURL: _url,
      timeout: 30000
    })
  }

  public async send(data: Buffer): Promise<Buffer> {
    const res = await this.axiosInstance.post<Buffer>('', data, this._config)
    if (res.headers['callback-url']) {
      // TODO - Update config if new value provided in callback-url and callback-auth headers
    }
    return res.data
  }
}
