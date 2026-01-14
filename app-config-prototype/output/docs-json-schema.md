# Configuration Reference

*Generated using zod-to-json-schema library*

## Environment Variables

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | enum: `development`, `test`, `production` | No | `"development"` | Current runtime environment |
| `LOG_LEVEL` | enum: `trace`, `debug`, `info`, `warn`, `error`, `fatal` | No | `"info"` | Logging verbosity level |
| `ADMIN_PORT` | integer (min: 1, max: 65535) | No | `3001` | Port for the Admin GraphQL API |
| `ADMIN_API_SECRET` | string (secret) | Yes | - | Secret used for authenticating admin API calls |
| `DATABASE_URL` | string (secret) | Yes | - | PostgreSQL connection URL |
| `REDIS_URL` | string | No | `"redis://127.0.0.1:6379"` | Redis connection URL for caching and sessions |
| `ENABLE_AUTO_PEERING` | boolean | No | `false` | Enable automatic peering between Rafiki nodes |
| `ENABLE_TELEMETRY` | boolean | No | `false` | Enable OpenTelemetry metrics collection |
| `WEBHOOK_URL` | string | Yes | - | URL to receive webhook notifications for payment events |
| `WEBHOOK_TIMEOUT` | integer (min: 100, max: 30000) | No | `2000` | Timeout in milliseconds for webhook requests |
| `CARD_SERVICE_URL` | string | No | - | Optional URL for card service integration |
| `PRIVATE_KEY_FILE` | string (secret) | Yes | - | Path to the private key file for signing requests |
| `SLIPPAGE` | number (min: 0, max: 1) | No | `0.01` | Maximum allowed exchange rate slippage (0-1) |

## Notes

- Fields marked as `(secret)` contain sensitive values and should be handled securely.
- URL fields must be valid URLs including the protocol (e.g., `https://example.com`).
- Boolean fields accept `true` or `false` string values.
