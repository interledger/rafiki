import axios from 'axios'
import { TokenService, TokenInfo } from '.'
import { LoggingService } from '..'

export class RemoteTokenService implements TokenService {
  constructor (private _url: string, private _log: LoggingService) {}

  public async introspect (token: string): Promise<TokenInfo> {
    this._log.debug(`Introspecting token [${token}] at ${this._url} `)
    const { data } = await axios.post<TokenInfo>(this._url, { token })
    return data
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async lookup (tokenInfo: TokenInfo): Promise<string | undefined> {
    throw new Error('not implemented')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async store (token: string, tokenInfo: TokenInfo): Promise<void> {
    throw new Error('not implemented')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async delete (tokenOrtokenInfo: string | TokenInfo): Promise<void> {
    throw new Error('not implemented')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async create (tokenInfo: TokenInfo): Promise<string> {
    throw new Error('not implemented')
  }
}
