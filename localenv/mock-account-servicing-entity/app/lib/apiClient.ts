import axios from 'axios'
import type { Access } from './types'

export const StepNames = {
  startInteraction: 0,
  getGrant: 1,
  chooseConsent: 2,
  endInteraction: 3
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type ApiResponse<T = any> = (
  | {
      readonly payload?: T
      readonly isFailure: false
    }
  | {
      readonly isFailure: true
      readonly errors: Array<string>
    }
) & {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  readonly contextUpdates?: { [key: string]: any }
}

export class ApiClient {
  /*
   * flow overview:
   *    1. get grant --> GET /grant/:id/:nonce
   *    2. user makes choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
   *    3. end interaction --> GET /interact/:id/:nonce/finish
   */

  public static async getGrant(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // get grant --> GET /grant/:id/:nonce
    const { interactId, nonce } = params
    const response = await axios.get(
      `http://localhost:3006/grant/${interactId}/${nonce}`,
      {
        headers: {
          'x-idp-secret': 'replace-me'
        }
      }
    )
    if (response.status === 200) {
      return {
        isFailure: false,
        payload: response.data.access,
        contextUpdates: {
          grant: response.data
        }
      }
    } else {
      return {
        errors: [`status ${response.status}: ${response.statusText}`],
        isFailure: true
      }
    }
  }

  public static async chooseConsent(
    interactId: string,
    nonce: string,
    acceptanceDecision: boolean
  ): Promise<ApiResponse<Array<Access>>> {
    // make choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
    const acceptanceSubPath = acceptanceDecision ? 'accept' : 'reject'

    const response = await axios.post(
      `http://localhost:3006/grant/${interactId}/${nonce}/${acceptanceSubPath}`,
      {},
      {
        headers: {
          'x-idp-secret': 'replace-me'
        }
      }
    )

    if (response.status === 202) {
      return {
        isFailure: false
      }
    } else {
      return {
        errors: [`status ${response.status}: ${response.statusText}`],
        isFailure: true
      }
    }
  }

  public static async endInteraction(
    interactId: string,
    nonce: string
  ): Promise<ApiResponse> {
    window.location.href = `http://localhost:3006/interact/${interactId}/${nonce}/finish`
    return {
      isFailure: false
    }
  }
}
