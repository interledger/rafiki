/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */


/** OneOf type helpers */
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;
type OneOf<T extends any[]> = T extends [infer Only] ? Only : T extends [infer A, infer B, ...infer Rest] ? OneOf<[XOR<A, B>, ...Rest]> : never;

export type paths = {
  "/": {
    /**
     * Introspect Access Token
     * @description Introspect an access token to get grant details.
     */
    post: operations["post-introspect"];
  };
};

export type webhooks = Record<string, never>;

export type components = {
  schemas: {
    /** token-info */
    "token-info": {
      /** @enum {boolean} */
      active: true;
      grant: string;
      access: external["auth-server.yaml"]["components"]["schemas"]["access"];
      /**
       * client
       * @description Payment pointer of the client instance that is making this request.
       *
       * When sending a non-continuation request to the AS, the client instance MUST identify itself by including the client field of the request and by signing the request.
       *
       * A JSON Web Key Set document, including the public key that the client instance will use to protect this request and any continuation requests at the AS and any user-facing information about the client instance used in interactions, MUST be available at the payment pointer + `/jwks.json` url.
       *
       * If sending a grant initiation request that requires RO interaction, the payment pointer MUST serve necessary client display information.
       */
      client: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};

export type $defs = Record<string, never>;

export type external = {
  "auth-server.yaml": {
    paths: {
      "/": {
        /**
         * Grant Request
         * @description Make a new grant request
         */
        post: operations["post-request"];
      };
      "/continue/{id}": {
        /**
         * Continuation Request
         * @description Continue a grant request during or after user interaction.
         */
        post: operations["post-continue"];
        /**
         * Cancel Grant
         * @description Cancel a grant request or delete a grant client side.
         */
        delete: operations["delete-continue"];
        parameters: {
          path: {
            id: string;
          };
        };
      };
      "/token/{id}": {
        /**
         * Rotate Access Token
         * @description Management endpoint to rotate access token.
         */
        post: operations["post-token"];
        /**
         * Revoke Access Token
         * @description Management endpoint to revoke access token.
         */
        delete: operations["delete-token"];
        parameters: {
          path: {
            id: string;
          };
        };
      };
    };
    webhooks: Record<string, never>;
    components: {
      schemas: {
        /** @description A description of the rights associated with this access token. */
        access: external["auth-server.yaml"]["components"]["schemas"]["access-item"][];
        /** @description The access associated with the access token is described using objects that each contain multiple dimensions of access. */
        "access-item": external["auth-server.yaml"]["components"]["schemas"]["access-incoming"] | external["auth-server.yaml"]["components"]["schemas"]["access-outgoing"] | external["auth-server.yaml"]["components"]["schemas"]["access-quote"];
        /** access-incoming */
        "access-incoming": {
          /**
           * @description The type of resource request as a string.  This field defines which other fields are allowed in the request object.
           * @enum {string}
           */
          type: "incoming-payment";
          /** @description The types of actions the client instance will take at the RS as an array of strings. */
          actions: ("create" | "complete" | "read" | "read-all" | "list" | "list-all")[];
          /**
           * Format: uri
           * @description A string identifier indicating a specific resource at the RS.
           */
          identifier?: string;
        };
        /** access-outgoing */
        "access-outgoing": {
          /**
           * @description The type of resource request as a string.  This field defines which other fields are allowed in the request object.
           * @enum {string}
           */
          type: "outgoing-payment";
          /** @description The types of actions the client instance will take at the RS as an array of strings. */
          actions: ("create" | "read" | "read-all" | "list" | "list-all")[];
          /**
           * Format: uri
           * @description A string identifier indicating a specific resource at the RS.
           */
          identifier: string;
          limits?: external["auth-server.yaml"]["components"]["schemas"]["limits-outgoing"];
        };
        /** access-quote */
        "access-quote": {
          /**
           * @description The type of resource request as a string.  This field defines which other fields are allowed in the request object.
           * @enum {string}
           */
          type: "quote";
          /** @description The types of actions the client instance will take at the RS as an array of strings. */
          actions: ("create" | "read" | "read-all")[];
        };
        /**
         * access_token
         * @description A single access token or set of access tokens that the client instance can use to call the RS on behalf of the RO.
         */
        access_token: {
          /** @description The value of the access token as a string.  The value is opaque to the client instance.  The value SHOULD be limited to ASCII characters to facilitate transmission over HTTP headers within other protocols without requiring additional encoding. */
          value: string;
          /**
           * Format: uri
           * @description The management URI for this access token. This URI MUST NOT include the access token value and SHOULD be different for each access token issued in a request.
           */
          manage: string;
          /** @description The number of seconds in which the access will expire.  The client instance MUST NOT use the access token past this time.  An RS MUST NOT accept an access token past this time. */
          expires_in?: number;
          access: external["auth-server.yaml"]["components"]["schemas"]["access"];
        };
        /**
         * client
         * @description Payment pointer of the client instance that is making this request.
         *
         * When sending a non-continuation request to the AS, the client instance MUST identify itself by including the client field of the request and by signing the request.
         *
         * A JSON Web Key Set document, including the public key that the client instance will use to protect this request and any continuation requests at the AS and any user-facing information about the client instance used in interactions, MUST be available at the payment pointer + `/jwks.json` url.
         *
         * If sending a grant initiation request that requires RO interaction, the payment pointer MUST serve necessary client display information.
         */
        client: string;
        /**
         * continue
         * @description If the AS determines that the request can be continued with additional requests, it responds with the continue field.
         */
        continue: {
          /** @description A unique access token for continuing the request, called the "continuation access token". */
          access_token: {
            value: string;
          };
          /**
           * Format: uri
           * @description The URI at which the client instance can make continuation requests.
           */
          uri: string;
          /** @description The amount of time in integer seconds the client instance MUST wait after receiving this request continuation response and calling the continuation URI. */
          wait?: number;
        };
        /**
         * interact
         * @description The client instance declares the parameters for interaction methods that it can support using the interact field.
         */
        "interact-request": {
          /** @description Indicates how the client instance can start an interaction. */
          start: "redirect"[];
          /** @description Indicates how the client instance can receive an indication that interaction has finished at the AS. */
          finish?: {
            /**
             * @description The callback method that the AS will use to contact the client instance.
             * @enum {string}
             */
            method: "redirect";
            /**
             * Format: uri
             * @description Indicates the URI that the AS will either send the RO to after interaction or send an HTTP POST request.
             */
            uri: string;
            /** @description Unique value to be used in the calculation of the "hash" query parameter sent to the callback URI, must be sufficiently random to be unguessable by an attacker.  MUST be generated by the client instance as a unique value for this request. */
            nonce: string;
          };
        };
        /** interact-response */
        "interact-response": {
          /**
           * Format: uri
           * @description The URI to direct the end user to.
           */
          redirect: string;
          /** @description Unique key to secure the callback. */
          finish: string;
        };
        /**
         * Interval
         * @description [ISO8601 repeating interval](https://en.wikipedia.org/wiki/ISO_8601#Repeating_intervals)
         */
        interval: string;
        /**
         * limits-outgoing
         * @description Open Payments specific property that defines the limits under which outgoing payments can be created.
         */
        "limits-outgoing": {
          receiver?: external["schemas.yaml"]["components"]["schemas"]["receiver"];
          /** @description All amounts are maxima, i.e. multiple payments can be created under a grant as long as the total amounts of these payments do not exceed the maximum amount per interval as specified in the grant. */
          debitAmount?: external["schemas.yaml"]["components"]["schemas"]["amount"];
          /** @description All amounts are maxima, i.e. multiple payments can be created under a grant as long as the total amounts of these payments do not exceed the maximum amount per interval as specified in the grant. */
          receiveAmount?: external["schemas.yaml"]["components"]["schemas"]["amount"];
          interval?: external["auth-server.yaml"]["components"]["schemas"]["interval"];
        };
      };
      responses: never;
      parameters: never;
      requestBodies: never;
      headers: never;
      pathItems: never;
    };
    $defs: Record<string, never>;
  };
  "schemas.yaml": {
    paths: Record<string, never>;
    webhooks: Record<string, never>;
    components: {
      schemas: {
        /** amount */
        amount: {
          /**
           * Format: uint64
           * @description The value is an unsigned 64-bit integer amount, represented as a string.
           */
          value: string;
          assetCode: external["schemas.yaml"]["components"]["schemas"]["assetCode"];
          assetScale: external["schemas.yaml"]["components"]["schemas"]["assetScale"];
        };
        /**
         * Asset code
         * @description The assetCode is a code that indicates the underlying asset. This SHOULD be an ISO4217 currency code.
         */
        assetCode: string;
        /**
         * Asset scale
         * @description The scale of amounts denoted in the corresponding asset code.
         */
        assetScale: number;
        /**
         * Receiver
         * Format: uri
         * @description The URL of the incoming payment or ILP STREAM connection that is being paid.
         */
        receiver: string;
      };
      responses: never;
      parameters: never;
      requestBodies: never;
      headers: never;
      pathItems: never;
    };
    $defs: Record<string, never>;
  };
};

export type operations = {

  /**
   * Introspect Access Token
   * @description Introspect an access token to get grant details.
   */
  "post-introspect": {
    requestBody: {
      content: {
        "application/json": {
          /** @description The access token value presented to the RS by the client instance. */
          access_token: string;
          access?: external["auth-server.yaml"]["components"]["schemas"]["access"];
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        content: {
          "application/json": OneOf<[{
            /** @enum {boolean} */
            active: false;
          }, components["schemas"]["token-info"]]>;
        };
      };
      /** @description Not Found */
      404: {
        content: never;
      };
    };
  };
  /**
   * Grant Request
   * @description Make a new grant request
   */
  "post-request": {
    requestBody?: {
      content: {
        "application/json": {
          access_token: {
            access: external["auth-server.yaml"]["components"]["schemas"]["access"];
          };
          client: external["auth-server.yaml"]["components"]["schemas"]["client"];
          interact?: external["auth-server.yaml"]["components"]["schemas"]["interact-request"];
        };
      };
    };
    responses: {
      /** @description OK */
      200: {
        content: {
          "application/json": OneOf<[{
            interact: external["auth-server.yaml"]["components"]["schemas"]["interact-response"];
            continue: external["auth-server.yaml"]["components"]["schemas"]["continue"];
          }, {
            access_token: external["auth-server.yaml"]["components"]["schemas"]["access_token"];
            continue: external["auth-server.yaml"]["components"]["schemas"]["continue"];
          }]>;
        };
      };
      /** @description Bad Request */
      400: {
        content: never;
      };
      /** @description Unauthorized */
      401: {
        content: never;
      };
      /** @description Internal Server Error */
      500: {
        content: never;
      };
    };
  };
  /**
   * Continuation Request
   * @description Continue a grant request during or after user interaction.
   */
  "post-continue": {
    parameters: {
      path: {
        id: string;
      };
    };
    requestBody?: {
      content: {
        "application/json": {
          /**
           * @description The interaction reference generated for this
           * interaction by the AS.
           */
          interact_ref: string;
        };
      };
    };
    responses: {
      /** @description Success */
      200: {
        content: {
          "application/json": {
            access_token?: external["auth-server.yaml"]["components"]["schemas"]["access_token"];
            continue: external["auth-server.yaml"]["components"]["schemas"]["continue"];
          };
        };
      };
      /** @description Bad Request */
      400: {
        content: never;
      };
      /** @description Unauthorized */
      401: {
        content: never;
      };
      /** @description Not Found */
      404: {
        content: never;
      };
    };
  };
  /**
   * Cancel Grant
   * @description Cancel a grant request or delete a grant client side.
   */
  "delete-continue": {
    parameters: {
      path: {
        id: string;
      };
    };
    responses: {
      /** @description No Content */
      204: {
        content: never;
      };
      /** @description Bad Request */
      400: {
        content: never;
      };
      /** @description Unauthorized */
      401: {
        content: never;
      };
      /** @description Not Found */
      404: {
        content: never;
      };
    };
  };
  /**
   * Rotate Access Token
   * @description Management endpoint to rotate access token.
   */
  "post-token": {
    parameters: {
      path: {
        id: string;
      };
    };
    responses: {
      /** @description OK */
      200: {
        content: {
          "application/json": {
            access_token: external["auth-server.yaml"]["components"]["schemas"]["access_token"];
          };
        };
      };
      /** @description Bad Request */
      400: {
        content: never;
      };
      /** @description Unauthorized */
      401: {
        content: never;
      };
      /** @description Not Found */
      404: {
        content: never;
      };
    };
  };
  /**
   * Revoke Access Token
   * @description Management endpoint to revoke access token.
   */
  "delete-token": {
    parameters: {
      path: {
        id: string;
      };
    };
    responses: {
      /** @description No Content */
      204: {
        content: never;
      };
      /** @description Bad Request */
      400: {
        content: never;
      };
      /** @description Unauthorized */
      401: {
        content: never;
      };
    };
  };
};
