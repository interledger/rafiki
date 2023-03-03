# Grant Interaction Flow

## Endpoints

Once a grant is initialized, there are four main endpoints that are used as part of an interaction to authorize the grant, if the AS deems it necessary. The endpoints, in order of their calling, are as follows:

- `GET /interact/:id/:nonce` (made by the client to the AS, establishes an interaction session, redirects browser session to IDP consent screen)
- `GET /grant/:id/:nonce` (made by the IDP to the AS, secured with `x-idp-secret` header, returns grant info for the consent screen to enumerate )
- `POST /grant/:id/:nonce/(accept OR reject)` (made by the IDP to the AS, secured with `x-idp-secret` header, accepts or rejects the grant based on the user's input on the consent screen. **IDP then redirects to `GET /interact/:id/:nonce/finish`**)
- `GET /interact/:id/:nonce/finish` (ends the interaction established by `GET /interact/:id/:nonce`, redirects browser session to client callback. Contains a query param that either indicates a failure, or on success, a `hash` parameter that the client can use to verify the successful interaction, and the `interact_ref` that identifies the interaction on the AS.)
  - Examples include:
    - `?result=grant_rejected` (if interaction was rejected)
    - `?result=grant_invalid` (if grant is not in a state where it may be accepted or rejected, e.g. already approved)
    - `?hash=p28jsq0Y2KK3WS__a42tavNC64ldGTBroywsWxT4md_jZQ1R\HZT8BOWYHcLmObM7XHPAdJzTZMtKBsaraJ64A
&interact_ref=4IFWWIKYBC2PQ6U56NL1` (if interaction was accepted)
      - `hash` is a `sha-256` hash of values provided by the client in the body of the [grant initialization request](https://docs.openpayments.guide/reference/post) (`interact.finish.nonce`), values returned in the AS response for that request (`interact.finish`), the `interact_ref` provided alongside the `hash`, and the uri of the grant initialization request (`https://auth-server.com/`).
- `POST /continue/:id` ([this should still be accurate](https://docs.openpayments.guide/reference/post-continue), final back-channel request made by client if interaction was successful, AS responds with an access token)

### On `x-idp-secret`

`x-idp-secret` is the name of a header that is used for `GET /grant/:id/:nonce`, `POST /grant/:id/:nonce/accept`, and `POST /grant/:id/:nonce/reject` requests. Its purpose is to secure communications between the IDP and the AS and its value should be a shared secret known to both entities.

To set this up, set the `IDENTITY_SERVER_SECRET` on the AS environment to a value that is also used to configure the IDP's requests to the AS.

## Sequence Diagram

```
sequenceDiagram
    Client->>Auth Server: Grant Request (POST /) with access_token and interact
    Auth Server-->>Client: 200 Return interact.redirect and continue.(uri/access_token)
    Client->>Auth Server: Navigate to interaction endpoint with interact.redirect
    Auth Server->>Auth Server: Start interaction, set session
    Auth Server-->>Client: 302 Redirect to Identity Provider with grant info (nonce, interaction id) in query string
    Client->>Identity Provider: Redirect to Identity Provider
    Identity Provider->>Identity Provider: Resource Owner Accepts interaction
    Identity Provider->>Auth Server: Send interaction choice (POST /interact/:id/:nonce/:choice)
    Auth Server-->>Identity Provider: 202 Accepted
    Identity Provider->>Auth Server: Finish Interaction (POST /interact/:id/:nonce/finish)
    Auth Server->>Auth Server: End session
    Auth Server-->>Identity Provider: 302 Redirect to Client, interact_ref and hash in query string
    Identity Provider->>Client: Follow redirect to Client
    Client->>Client: Verify hash
    Client->>Auth Server: Continue Grant (POST /continue/:id)
    Auth Server-->>Client: 200 Return Grant
```
