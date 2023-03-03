# Grant Interaction Flow

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
