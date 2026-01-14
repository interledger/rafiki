# Configuration Reference

## AppConfig

_Object containing the following properties:_

| Property                  | Description                                             | Type                                                           | Default                    |
| :------------------------ | :------------------------------------------------------ | :------------------------------------------------------------- | :------------------------- |
| `env`                     | Current runtime environment                             | `'development' \| 'test' \| 'production'`                      | `'development'`            |
| `logLevel`                | Logging verbosity level                                 | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'`                   |
| `adminPort`               | Port for the Admin GraphQL API                          | `number` (_int, ≥1, ≤65535_)                                   | `3001`                     |
| **`adminApiSecret`** (\*) | Secret used for authenticating admin API calls          | `string` (_min length: 1_)                                     |                            |
| **`databaseUrl`** (\*)    | PostgreSQL connection URL                               | `string` (_url_)                                               |                            |
| `redisUrl`                | Redis connection URL for caching and sessions           | `string` (_url_)                                               | `'redis://127.0.0.1:6379'` |
| `enableAutoPeering`       | Enable automatic peering between Rafiki nodes           | `boolean` (_nullable_)                                         | `false`                    |
| `enableTelemetry`         | Enable OpenTelemetry metrics collection                 | `boolean` (_nullable_)                                         | `false`                    |
| **`webhookUrl`** (\*)     | URL to receive webhook notifications for payment events | `string` (_url_)                                               |                            |
| `webhookTimeout`          | Timeout in milliseconds for webhook requests            | `number` (_int, ≥100, ≤30000_)                                 | `2000`                     |
| `cardServiceUrl`          | Optional URL for card service integration               | `string` (_url_)                                               |                            |
| **`privateKeyFile`** (\*) | Path to the private key file for signing requests       | `string` (_min length: 1_)                                     |                            |
| `slippage`                | Maximum allowed exchange rate slippage (0-1)            | `number` (_≥0, ≤1_) (_nullable_)                               | `0.01`                     |

_(\*) Required._
