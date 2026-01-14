# Problem

Setting up and integrating with Rafiki is hard. One factor in this is application configuration. We have lots of environment variables and understanding them is difficult. We have documentation to help with this, but it’s prone to getting out of sync with the actual configuration.

Additionally, Rafiki currently does little to no validation of the provided environment variables. Misconfigurations don’t fail fast, which can make bugs hard to diagnose.

---

# Solution

A schema-based config with defaults (if appropriate), descriptions, and validation upon load will improve the feedback loop on configuring Rafiki.

Values are supplied at runtime however we want—as they currently are—via env vars, secret managers, files, etc. You will not discover you provided an invalid URL one week after you set it and finally got around to testing the part of the code where it’s used and tracing through esoteric logs for an hour. The validator will reject it on load with a clear message.

Additionally, the schema can be used to generate documentation. No more manually forming the env var docs—they are now one and the same with the definition. Deployment should be agnostic, since any injection method should work.

---

# Example

## Config Definition

Using Zod.

```ts
import { z } from 'zod'

// Config schema
export const AppConfigSchema = z.object({
  env: z
    .enum(['development', 'test', 'production'])
    .default('development')
    .describe('Current runtime environment'),

  adminApiSecret: z
    .string()
    .describe('Secret used for authenticating admin API calls')
    .meta({ secret: true }),

  cardServiceUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional URL for card service integration'),

  cardWebhookUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional webhook URL to receive card events'),

  privateKeyFile: z
    .string()
    .describe('Path to the private key file for signing requests')
    .meta({ secret: true }),

  enableAutoPeering: z
    .boolean()
    .default(false)
    .describe('Enable automatic peering between nodes')
})

// Type for TS
export type AppConfig = z.infer<typeof AppConfigSchema>

// Example usage: load from env
export const config: AppConfig = AppConfigSchema.parse({
  env: process.env.NODE_ENV,
  adminApiSecret: process.env.ADMIN_API_SECRET,
  cardServiceUrl: process.env.CARD_SERVICE_URL,
  cardWebhookUrl: process.env.CARD_WEBHOOK_URL,
  privateKeyFile: process.env.PRIVATE_KEY_FILE,
  enableAutoPeering: process.env.ENABLE_AUTO_PEERING === 'true'
})
```
