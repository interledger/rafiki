/**
 * Demo: Generate markdown documentation from the config schema.
 *
 * This demonstrates three approaches:
 * 1. zod2md - Purpose-built library for Zod to Markdown
 * 2. zod-to-json-schema - Convert to JSON Schema, then format
 * 3. Handrolled - Custom schema walker
 *
 * Run with: pnpm generate:docs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateMarkdownFromZod2md } from '../markdown/zod2md.js'
import { generateMarkdownFromJsonSchema } from '../markdown/json-schema.js'
import { generateMarkdownHandrolled } from '../markdown/handrolled.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(__dirname, '../../output')

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('Generating configuration documentation...')
  console.log('')

  // 1. Generate using zod2md library
  console.log('1. Generating with zod2md library...')
  try {
    const zod2mdOutput = await generateMarkdownFromZod2md()
    const zod2mdPath = path.join(outputDir, 'docs-zod2md.md')
    fs.writeFileSync(zod2mdPath, zod2mdOutput)
    console.log(`   Written to: ${zod2mdPath}`)
  } catch (err) {
    console.log(`   \x1b[31mError: ${err instanceof Error ? err.message : err}\x1b[0m`)
  }

  // 2. Generate using zod-to-json-schema approach
  console.log('')
  console.log('2. Generating with zod-to-json-schema library...')
  const jsonSchemaOutput = generateMarkdownFromJsonSchema()
  const jsonSchemaPath = path.join(outputDir, 'docs-json-schema.md')
  fs.writeFileSync(jsonSchemaPath, jsonSchemaOutput)
  console.log(`   Written to: ${jsonSchemaPath}`)

  // 3. Generate using handrolled approach
  console.log('')
  console.log('3. Generating with handrolled schema walker...')
  const handrolledOutput = generateMarkdownHandrolled()
  const handrolledPath = path.join(outputDir, 'docs-handrolled.md')
  fs.writeFileSync(handrolledPath, handrolledOutput)
  console.log(`   Written to: ${handrolledPath}`)

  console.log('')
  console.log('\x1b[32m%s\x1b[0m', '✓ Documentation generated successfully!')
  console.log('')
  console.log('Comparison:')
  console.log('')
  console.log('\x1b[36mzod2md:\x1b[0m')
  console.log('  Pros: Purpose-built for Zod→Markdown, minimal code, rich output')
  console.log('  Cons: Less control over format, file-based entry point required')
  console.log('')
  console.log('\x1b[36mzod-to-json-schema:\x1b[0m')
  console.log('  Pros: Standard JSON Schema intermediate format')
  console.log('  Cons: Still requires custom markdown formatting')
  console.log('')
  console.log('\x1b[36mHandrolled:\x1b[0m')
  console.log('  Pros: No dependencies, full control over output')
  console.log('  Cons: Must handle each Zod type, more maintenance')
  console.log('')

  // Show preview of outputs
  console.log('---')
  console.log('')
  console.log('\x1b[33mPreview of zod-to-json-schema output:\x1b[0m')
  console.log('')
  console.log(jsonSchemaOutput.split('\n').slice(0, 15).join('\n'))
  console.log('...')
  console.log('')
  console.log('\x1b[33mPreview of handrolled output:\x1b[0m')
  console.log('')
  console.log(handrolledOutput.split('\n').slice(0, 15).join('\n'))
  console.log('...')
}

main().catch(console.error)
