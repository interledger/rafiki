import { Access } from './types'

export const StepNames = {
  startInteraction: 0,
  getGrant: 1,
  chooseConsent: 2,
  endInteraction: 3
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type ApiResponse<T = any> = ({
  readonly payload?: T
  readonly isFailure: false
} | {
    readonly isFailure: true
    readonly errors: Array<string>
}) & {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    readonly contextUpdates?: { [key: string]: any }
}

export class ApiClient {
  /*
   * flow overview:
   *    1. start interaction --> GET /interact/:id/:nonce
   *    2. get grant --> GET /grant/:id/:nonce
   *    3. user makes choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
   *    4. end interaction --> GET /interact/:id/:nonce/finish
   */

  public static BaseUrl = '/mock-idp/auth-proxy?hostname=localhost&port=3006'

  public static async startInteraction(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // start interaction --> GET /interact/:id/:nonce
    const { interactId, nonce } = params
    const response = await ApiClient.apiCall(
      'GET',
      `/interact/${interactId}/${nonce}`
    )
    if (response.ok) {
      return {
        isFailure: false,
        payload: {
          interactionUrl: response.responseText
        }
      }
    } else {
      return {
        errors: [
            `status ${response.status}: ${response.responseText}`
        ],
        isFailure: true
      }
    }
  }

  public static async getGrant(
    params: Record<string, string>
  ): Promise<ApiResponse<Array<Access>>> {
    // get grant --> GET /grant/:id/:nonce
    const { interactId, nonce } = params
    const response = await ApiClient.apiCall(
      'GET',
      `/grant/${interactId}/${nonce}`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      const grant = JSON.parse(response.responseText)
      return {
        isFailure: false,
        payload: grant.access,
        contextUpdates: {
          grant
        }
      }
    } else {
      return {
        errors: [
            `status ${response.status}: ${response.responseText}`
        ],
        isFailure: true
      }
    }
  }

  public static async chooseConsent(
    interactId: string, nonce: string, acceptanceDecision: boolean
  ): Promise<ApiResponse<Array<Access>>> {
    // make choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
    const acceptanceSubPath =
      acceptanceDecision ? 'accept' : 'reject'
    const response = await ApiClient.apiCall(
      'POST',
      `/grant/${interactId}/${nonce}/${acceptanceSubPath}`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      return {
        isFailure: false,
        payload: JSON.parse(response.responseText).access
      }
    } else {
      return {
        errors: [
            `status ${response.status}: ${response.responseText}`
        ],
        isFailure: true
      }
    }
  }

  public static async endInteraction(
    interactId: string, nonce: string
  ): Promise<ApiResponse<{
    interact_ref: string
  }>> {
    // end interaction --> GET /interact/:id/:nonce/finish
    const response = await ApiClient.apiCall(
      'GET',
      `/interact/${interactId}/${nonce}/finish`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      return {
        isFailure: false,
        payload: JSON.parse(response.responseText)
      }
    } else {
      return {
        errors: [
            `status ${response.status}: ${response.responseText}`
        ],
        isFailure: true
      }
    }
  }

  private static apiCall(
    apiMethod: 'GET' | 'POST',
    apiPath: string,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    payload?: any,
    headers?: { [headerName: string]: string }
  ): Promise<{
    readonly responseText: string
    readonly status: number
    readonly ok: boolean
  }> {
    return new Promise((resolve, reject) => {
      try {
        const fullUrl =
          ApiClient.BaseUrl +
          `&method=${apiMethod}&target=${encodeURIComponent(
            apiPath.replace(/^\//, '')
          )}`
        const xhr = new XMLHttpRequest()
        xhr.open('GET', fullUrl)
        xhr.setRequestHeader('signature', 'signature')
        xhr.setRequestHeader('signature-input', 'signature-input')
        if (headers) {
          Object.keys(headers).forEach((h) => {
            xhr.setRequestHeader(h, headers[h])
          })
        }
        xhr.onreadystatechange = function (ev) {
          if (this.readyState === 4) {
            resolve({
              responseText: this.responseText,
              status: this.status,
              ok: this.status >= 200 && this.status <= 399
            })
          }
        }
        xhr.send(payload === undefined ? undefined : JSON.stringify(payload))
      } catch (exc) {
        reject(exc)
      }
    })
  }
}