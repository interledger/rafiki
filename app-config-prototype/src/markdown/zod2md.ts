import { zod2md } from 'zod2md'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Generate markdown documentation using the zod2md library.
 *
 * This approach:
 * 1. Points zod2md at the schema file
 * 2. Library automatically discovers exported Zod schemas
 * 3. Generates complete markdown documentation
 *
 * Pros: Purpose-built for Zod→Markdown, minimal code required
 * Cons: Less control over output format, requires file-based entry point
 */
export async function generateMarkdownFromZod2md(): Promise<string> {
  const schemaPath = path.resolve(__dirname, '../schema.ts')

  const markdown = await zod2md({
    entry: schemaPath,
    title: 'Configuration Reference',
    tsconfig: path.resolve(__dirname, '../../tsconfig.json')
  })

  return markdown
}
