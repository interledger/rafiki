import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { join } from 'path'
import { Grant } from '../grant/model'
import { AccessToken as OpenPaymentsAccessToken } from '@interledger/open-payments'
import { Access, toOpenPaymentsAccess } from '../access/model'

// https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-3.2.1
export class AccessToken extends BaseModel {
  public static get tableName(): string {
    return 'accessTokens'
  }

  static relationMappings = {
    grant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'accessTokens.grantId',
        to: 'grants.id'
      }
    }
  }

  public grant?: Grant
  public value!: string
  public managementId!: string
  public grantId!: string
  public expiresIn!: number
  public revokedAt?: Date
}

interface ToOpenPaymentsAccessTokenArgs {
  authServerUrl: string
}

export function toOpenPaymentsAccessToken(
  accessToken: AccessToken,
  accessItems: Access[],
  args: ToOpenPaymentsAccessTokenArgs
): OpenPaymentsAccessToken['access_token'] {
  return {
    access: accessItems.map(toOpenPaymentsAccess),
    value: accessToken.value,
    manage: `${args.authServerUrl}/token/${accessToken.managementId}`,
    expires_in: accessToken.expiresIn
  }
}
