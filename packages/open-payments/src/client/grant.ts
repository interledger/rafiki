import { HttpMethod } from 'openapi'
import {
  ResourceRequestArgs,
  RouteDeps,
  UnauthenticatedResourceRequestArgs
} from '.'
import {
  getASPath,
  PendingGrant,
  Grant,
  GrantRequest,
  GrantContinuationRequest
} from '../types'
import { post, deleteRequest } from './requests'

interface GrantRouteDeps extends RouteDeps {
  client: string
}

export interface GrantRoutes {
  /**
   * Makes a new grant request.
   * @see [Open Payments - Grant Request](https://docs.openpayments.guide/reference/post-request)
   *
   * @returns A grant with an access token, or a pending grant that requires user-interaction.
   */
  request(
    postArgs: UnauthenticatedResourceRequestArgs,
    args: Omit<GrantRequest, 'client'>
  ): Promise<PendingGrant | Grant>
  continue(
    postArgs: ResourceRequestArgs,
    args: GrantContinuationRequest
  ): Promise<Grant>
  /**
   * Cancels a grant.
   * @see [Open Payments - Cancel Grant](https://docs.openpayments.guide/reference/delete-continue)
   */
  cancel(postArgs: ResourceRequestArgs): Promise<void>
}

/** @hidden */
export const createGrantRoutes = (deps: GrantRouteDeps): GrantRoutes => {
  const requestGrantValidator = deps.openApi.createResponseValidator<
    PendingGrant | Grant
  >({
    path: getASPath('/'),
    method: HttpMethod.POST
  })
  const continueGrantValidator = deps.openApi.createResponseValidator<Grant>({
    path: getASPath('/continue/{id}'),
    method: HttpMethod.POST
  })
  const cancelGrantValidator = deps.openApi.createResponseValidator({
    path: getASPath('/continue/{id}'),
    method: HttpMethod.DELETE
  })

  return {
    request: (
      { url }: UnauthenticatedResourceRequestArgs,
      args: Omit<GrantRequest, 'client'>
    ) =>
      post(
        deps,
        {
          url,
          body: {
            ...args,
            client: deps.client
          }
        },
        requestGrantValidator
      ),
    continue: (
      { url, accessToken }: ResourceRequestArgs,
      args: GrantContinuationRequest
    ) =>
      post(
        deps,
        {
          url,
          accessToken,
          body: args
        },
        continueGrantValidator
      ),
    cancel: ({ url, accessToken }: ResourceRequestArgs) =>
      deleteRequest(
        deps,
        {
          url,
          accessToken
        },
        cancelGrantValidator
      )
  }
}
