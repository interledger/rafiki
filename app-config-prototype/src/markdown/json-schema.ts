import { zodToJsonSchema } from 'zod-to-json-schema'
import { AppConfigSchema, envVarMapping, secretFields, AppConfig } from '../schema.js'

interface JsonSchemaProperty {
  type?: string | string[]
  description?: string
  default?: unknown
  enum?: string[]
  minimum?: number
  maximum?: number
}

interface JsonSchema {
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * Generate markdown documentation from the Zod schema using zod-to-json-schema library.
 *
 * This approach:
 * 1. Converts Zod schema to JSON Schema (standard format)
 * 2. Parses JSON Schema to extract field metadata
 * 3. Generates markdown table
 *
 * Pros: Standard JSON Schema intermediate format
 * Cons: Still requires custom markdown formatting, extra dependency
 */
export function generateMarkdownFromJsonSchema(): string {
  const jsonSchema = zodToJsonSchema(AppConfigSchema, {
    errorMessages: true
  }) as JsonSchema

  const lines: string[] = [
    '# Configuration Reference',
    '',
    '*Generated using zod-to-json-schema library*',
    '',
    '## Environment Variables',
    '',
    '| Variable | Type | Required | Default | Description |',
    '|----------|------|----------|---------|-------------|'
  ]

  const properties = jsonSchema.properties || {}
  const required = new Set(jsonSchema.required || [])

  for (const [field, prop] of Object.entries(properties)) {
    const envVar = envVarMapping[field as keyof AppConfig] || field.toUpperCase()
    const isRequired = required.has(field)
    const isSecret = secretFields.has(field as keyof AppConfig)

    // Determine type string
    let typeStr = formatType(prop)
    if (isSecret) {
      typeStr += ' (secret)'
    }

    // Format default value
    const defaultVal = prop.default !== undefined ? `\`${JSON.stringify(prop.default)}\`` : '-'

    // Get description
    const description = prop.description || '-'

    lines.push(
      `| \`${envVar}\` | ${typeStr} | ${isRequired ? 'Yes' : 'No'} | ${defaultVal} | ${description} |`
    )
  }

  lines.push('')
  lines.push('## Notes')
  lines.push('')
  lines.push('- Fields marked as `(secret)` contain sensitive values and should be handled securely.')
  lines.push('- URL fields must be valid URLs including the protocol (e.g., `https://example.com`).')
  lines.push('- Boolean fields accept `true` or `false` string values.')
  lines.push('')

  return lines.join('\n')
}

function formatType(prop: JsonSchemaProperty): string {
  if (prop.enum) {
    return `enum: ${prop.enum.map((v) => `\`${v}\``).join(', ')}`
  }

  let type = Array.isArray(prop.type) ? prop.type[0] : prop.type || 'unknown'

  // Add constraints
  const constraints: string[] = []
  if (prop.minimum !== undefined) constraints.push(`min: ${prop.minimum}`)
  if (prop.maximum !== undefined) constraints.push(`max: ${prop.maximum}`)

  if (constraints.length > 0) {
    type += ` (${constraints.join(', ')})`
  }

  return type
}
