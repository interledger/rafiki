/**
 * Demo: Load config with valid environment variables.
 *
 * Run with: pnpm demo:valid
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig, redactConfig } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.resolve(__dirname, '../../.env.valid')

console.log('Loading config from:', envFile)
console.log('')

const result = loadConfig({ envFile })

if (result.success) {
  console.log('\x1b[32m%s\x1b[0m', '✓ Config loaded successfully!')
  console.log('')
  console.log('Configuration values (secrets redacted):')
  console.log('')
  console.log(JSON.stringify(redactConfig(result.config), null, 2))
} else {
  console.log('\x1b[31m%s\x1b[0m', '✗ Config validation failed!')
  console.log('')
  for (const error of result.errors) {
    console.log(`  - ${error.envVar}: ${error.message}`)
  }
  process.exit(1)
}
