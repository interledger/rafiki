import { Model, Pojo, QueryContext } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { Access } from '../access/model'
import { join } from 'path'
import {
  PendingGrant as OpenPaymentsPendingGrant,
  Grant as OpenPaymentsGrant,
  GrantContinuation as OpenPaymentsGrantContinuation
} from '@interledger/open-payments'
import { AccessToken, toOpenPaymentsAccessToken } from '../accessToken/model'
import { Interaction } from '../interaction/model'
import { Subject, toOpenPaymentsSubject } from '../subject/model'
import { Tenant } from '../tenant/model'

export enum StartMethod {
  Redirect = 'redirect'
}

export enum FinishMethod {
  Redirect = 'redirect'
}

export enum GrantFinalization {
  Issued = 'ISSUED',
  Revoked = 'REVOKED',
  Rejected = 'REJECTED'
}

export enum GrantState {
  Processing = 'PROCESSING',
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Finalized = 'FINALIZED'
}

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    accessTokens: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../accessToken/model'),
      join: {
        from: 'grants.id',
        to: 'accessTokens.grantId'
      }
    },
    access: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../access/model'),
      join: {
        from: 'grants.id',
        to: 'accesses.grantId'
      }
    },
    subjects: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../subject/model'),
      join: {
        from: 'grants.id',
        to: 'subjects.grantId'
      }
    },
    interaction: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../interaction/model'),
      join: {
        from: 'grants.id',
        to: 'interactions.grantId'
      }
    },
    tenant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../tenant/model'),
      join: {
        from: 'grants.tenantId',
        to: 'tenants.id'
      }
    }
  })
  public access?: Access[]
  public subjects?: Subject[]
  public state!: GrantState
  public finalizationReason?: GrantFinalization
  public startMethod!: StartMethod[]
  public identifier!: string

  public continueToken!: string
  public continueId!: string

  public finishMethod?: FinishMethod
  public finishUri?: string
  public client!: string
  public clientNonce?: string // client-generated nonce for post-interaction hash

  public lastContinuedAt!: Date

  public tenantId!: string

  public tenant?: Tenant

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)
    this.lastContinuedAt = new Date()
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      ...json,
      lastContinuedAt: json.lastContinuedAt.toISOString()
    }
  }
}

interface ToOpenPaymentsPendingGrantArgs {
  authServerUrl: string
  client: {
    name: string
    uri: string
  }
  waitTimeSeconds?: number
}

export function toOpenPaymentPendingGrant(
  grant: Grant,
  interaction: Interaction,
  args: ToOpenPaymentsPendingGrantArgs
): OpenPaymentsPendingGrant {
  const { authServerUrl, client, waitTimeSeconds } = args

  const redirectUri = new URL(
    authServerUrl + `/interact/${interaction.id}/${interaction.nonce}`
  )

  redirectUri.searchParams.set('clientName', client.name)
  redirectUri.searchParams.set('clientUri', client.uri)

  return {
    interact: {
      redirect: redirectUri.toString(),
      finish: interaction.nonce
    },
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: `${authServerUrl}/continue/${grant.continueId}`,
      wait: waitTimeSeconds
    }
  }
}

interface ToOpenPaymentsGrantArgs {
  authServerUrl: string
  waitTimeSeconds?: number
}

export function toOpenPaymentsGrantContinuation(
  grant: Grant,
  args: ToOpenPaymentsGrantArgs
): OpenPaymentsGrantContinuation {
  return {
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: `${args.authServerUrl}/continue/${grant.continueId}`,
      wait: args.waitTimeSeconds
    }
  }
}

export function toOpenPaymentsGrant(
  grant: Grant,
  args: ToOpenPaymentsGrantArgs,
  accessToken?: AccessToken,
  accessItems?: Access[],
  subjectItems?: Subject[]
): OpenPaymentsGrant {
  return {
    access_token:
      accessToken && accessItems?.length
        ? toOpenPaymentsAccessToken(accessToken, accessItems, {
            authServerUrl: args.authServerUrl
          })
        : undefined,
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: `${args.authServerUrl}/continue/${grant.continueId}`
    },
    subject: subjectItems?.length
      ? {
          sub_ids: subjectItems.map(toOpenPaymentsSubject)
        }
      : undefined
  } as OpenPaymentsGrant
}

export interface FinishableGrant extends Grant {
  finishMethod: NonNullable<Grant['finishMethod']>
  finishUri: NonNullable<Grant['finishUri']>
}

export function isFinishableGrant(grant: Grant): grant is FinishableGrant {
  return !!(grant.finishMethod && grant.finishUri)
}

export function isRejectedGrant(grant: Grant): boolean {
  return !!(
    grant.state === GrantState.Finalized &&
    grant.finalizationReason === GrantFinalization.Rejected
  )
}

export function isRevokedGrant(grant: Grant): boolean {
  return !!(
    grant.state === GrantState.Finalized &&
    grant.finalizationReason === GrantFinalization.Revoked
  )
}

export interface GrantWithTenant extends Grant {
  tenant: NonNullable<Grant['tenant']>
}

export function isGrantWithTenant(grant: Grant): grant is GrantWithTenant {
  return !!grant.tenant
}
