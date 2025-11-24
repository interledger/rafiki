import js from '@eslint/js'
import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import eslintPluginAstro from 'eslint-plugin-astro'
import globals from 'globals'

export default [
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      '.astro',
      '**/*.d.ts',
      '**/*.html'
    ]
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off'
    }
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin
    },
    rules: {
      ...tseslintPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ['*.astro'],
    plugins: {
      astro: eslintPluginAstro
    },
    languageOptions: {
      parser: eslintPluginAstro.parser,
      parserOptions: {
        parser: tsparser,
        extraFileExtensions: ['.astro']
      }
    },
    rules: {
      ...eslintPluginAstro.configs.recommended.rules
    }
  },
  prettierConfig
]
