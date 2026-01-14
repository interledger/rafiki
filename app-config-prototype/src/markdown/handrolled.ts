import {
  z,
  ZodObject,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodEnum,
  ZodDefault,
  ZodOptional,
  ZodTypeAny
} from 'zod'
import { AppConfigSchema, envVarMapping, secretFields, AppConfig } from '../schema.js'

interface FieldInfo {
  field: string
  envVar: string
  type: string
  required: boolean
  defaultValue: string
  description: string
  isSecret: boolean
}

/**
 * Generate markdown documentation by manually walking the Zod schema.
 *
 * This approach:
 * 1. Iterates over the schema shape
 * 2. Unwraps nested types (ZodDefault, ZodOptional, etc.)
 * 3. Extracts metadata directly from Zod types
 * 4. Generates markdown table
 *
 * Pros: Full control, no dependencies
 * Cons: Must handle each Zod type manually, more maintenance
 */
export function generateMarkdownHandrolled(): string {
  const fields = extractFieldInfo(AppConfigSchema)

  const lines: string[] = [
    '# Configuration Reference',
    '',
    '*Generated using handrolled schema walker*',
    '',
    '## Environment Variables',
    '',
    '| Variable | Type | Required | Default | Description |',
    '|----------|------|----------|---------|-------------|'
  ]

  for (const field of fields) {
    let typeStr = field.type
    if (field.isSecret) {
      typeStr += ' (secret)'
    }

    lines.push(
      `| \`${field.envVar}\` | ${typeStr} | ${field.required ? 'Yes' : 'No'} | ${field.defaultValue} | ${field.description} |`
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

function extractFieldInfo(schema: ZodObject<Record<string, ZodTypeAny>>): FieldInfo[] {
  const fields: FieldInfo[] = []
  const shape = schema.shape

  for (const [field, zodType] of Object.entries(shape)) {
    const envVar = envVarMapping[field as keyof AppConfig] || field.toUpperCase()
    const isSecret = secretFields.has(field as keyof AppConfig)

    // Unwrap the type to get the inner type and metadata
    const { innerType, hasDefault, defaultValue, isOptional } = unwrapType(zodType)

    fields.push({
      field,
      envVar,
      type: getTypeName(innerType),
      required: !hasDefault && !isOptional,
      defaultValue: hasDefault ? `\`${JSON.stringify(defaultValue)}\`` : '-',
      description: zodType.description || '-',
      isSecret
    })
  }

  return fields
}

interface UnwrapResult {
  innerType: ZodTypeAny
  hasDefault: boolean
  defaultValue: unknown
  isOptional: boolean
}

function unwrapType(zodType: ZodTypeAny): UnwrapResult {
  let current = zodType
  let hasDefault = false
  let defaultValue: unknown = undefined
  let isOptional = false

  // Unwrap layers of ZodDefault, ZodOptional, etc.
  while (true) {
    if (current instanceof ZodDefault) {
      hasDefault = true
      defaultValue = current._def.defaultValue()
      current = current._def.innerType
    } else if (current instanceof ZodOptional) {
      isOptional = true
      current = current._def.innerType
    } else {
      break
    }
  }

  return { innerType: current, hasDefault, defaultValue, isOptional }
}

function getTypeName(zodType: ZodTypeAny): string {
  // Handle coerced types by checking the _def
  const typeName = zodType._def.typeName

  if (zodType instanceof ZodString) {
    // Check for URL validation
    const checks = zodType._def.checks || []
    const hasUrlCheck = checks.some((c: { kind: string }) => c.kind === 'url')
    if (hasUrlCheck) {
      return 'string (url)'
    }
    return 'string'
  }

  if (zodType instanceof ZodNumber) {
    const checks = zodType._def.checks || []
    const constraints: string[] = []

    for (const check of checks) {
      if (check.kind === 'int') constraints.push('integer')
      if (check.kind === 'min') constraints.push(`min: ${check.value}`)
      if (check.kind === 'max') constraints.push(`max: ${check.value}`)
    }

    if (constraints.length > 0) {
      return `number (${constraints.join(', ')})`
    }
    return 'number'
  }

  if (zodType instanceof ZodBoolean) {
    return 'boolean'
  }

  if (zodType instanceof ZodEnum) {
    const values = zodType._def.values as string[]
    return `enum: ${values.map((v) => `\`${v}\``).join(', ')}`
  }

  // Handle coerced types
  if (typeName === 'ZodNumber') {
    return 'number'
  }
  if (typeName === 'ZodBoolean') {
    return 'boolean'
  }

  return 'unknown'
}
