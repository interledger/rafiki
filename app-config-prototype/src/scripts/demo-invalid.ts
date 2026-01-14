/**
 * Demo: Load config with invalid environment variables.
 *
 * This demonstrates how Zod validation catches misconfigurations
 * with clear, actionable error messages.
 *
 * Run with: pnpm demo:invalid
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.resolve(__dirname, '../../.env.invalid')

console.log('Loading config from:', envFile)
console.log('')
console.log('This file contains intentional errors to demonstrate validation:')
console.log('  - NODE_ENV set to invalid value')
console.log('  - WEBHOOK_URL is not a valid URL')
console.log('  - ADMIN_API_SECRET is missing (required)')
console.log('  - DATABASE_URL is missing (required)')
console.log('')

const result = loadConfig({ envFile })

if (result.success) {
  console.log('\x1b[32m%s\x1b[0m', '✓ Config loaded successfully!')
  console.log('')
  console.log('(This should not happen with the invalid .env file)')
} else {
  console.log('\x1b[31m%s\x1b[0m', '✗ Config validation failed!')
  console.log('')
  console.log('Validation errors:')
  console.log('')
  for (const error of result.errors) {
    console.log(`  \x1b[33m${error.envVar}\x1b[0m: ${error.message}`)
  }
  console.log('')
  console.log('\x1b[36m%s\x1b[0m', 'This is the expected behavior - fast failure with clear messages!')
}
