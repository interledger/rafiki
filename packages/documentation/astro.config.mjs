import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import react from '@astrojs/react'
// import overrideIntegration from './src/overrideIntegration.mjs'

import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'
import remarkMermaid from 'remark-mermaidjs'
import GraphQL from 'astro-graphql-plugin'

// https://astro.build/config
export default defineConfig({
  site: 'https://rafiki.dev',
  outDir: './build',
  markdown: {
    remarkPlugins: [remarkMath, remarkMermaid],
    rehypePlugins: [rehypeMathjax]
  },
  integrations: [
    // overrideIntegration(), # TODO: figure out the path problem for this plugin
    starlight({
      title: 'Rafiki',
      customCss: [
        './node_modules/@interledger/docs-design-system/src/styles/orange-theme.css',
        './node_modules/@interledger/docs-design-system/src/styles/ilf-docs.css',
        './src/styles/rafiki.css'
      ],
      head: [
        {
          tag: 'script',
          attrs: {
            src: '/scripts.js',
            defer: true
          }
        }
      ],
      logo: {
        src: './public/img/icon.svg'
      },
      social: {
        github:
          'https://github.com/interledger/rafiki/tree/main/packages/documentation'
      },
      sidebar: [
        {
          label: 'Docs',
          items: [
            {
              label: 'Introduction',
              collapsed: true,
              items: [
                {
                  label: 'Overview',
                  link: 'introduction/overview'
                },
                {
                  label: 'Architecture',
                  link: 'introduction/architecture'
                }
              ]
            },
            {
              label: 'Concepts',
              collapsed: true,
              items: [
                {
                  label: 'Interledger Protocol',
                  items: [
                    {
                      label: 'Overview',
                      link: 'concepts/interledger-protocol/overview'
                    },
                    {
                      label: 'Connector',
                      link: 'concepts/interledger-protocol/connector'
                    },
                    {
                      label: 'Peering',
                      link: 'concepts/interledger-protocol/peering'
                    }
                  ]
                },
                {
                  label: 'Open Payments',
                  items: [
                    {
                      label: 'Overview',
                      link: 'concepts/open-payments/overview'
                    },
                    {
                      label: 'Key Registry',
                      link: 'concepts/open-payments/key-registry'
                    },
                    {
                      label: 'Grant Interaction Flow',
                      link: 'concepts/open-payments/grant-interaction'
                    }
                  ]
                },
                {
                  label: 'Accounting',
                  collapsed: true,
                  autogenerate: {
                    directory: 'concepts/accounting'
                  }
                },
                {
                  label: 'Account Servicing Entity',
                  link: 'concepts/account-servicing-entity'
                },
                {
                  label: 'Asset',
                  link: 'concepts/asset'
                }
              ]
            },
            {
              label: 'Integration',
              collapsed: true,
              items: [
                {
                  label: 'Getting Started',
                  link: 'integration/getting-started'
                },
                {
                  label: 'Deployment',
                  link: 'integration/deployment'
                },
                {
                  label: 'Management',
                  link: 'integration/management'
                },
                {
                  label: 'Event Handlers',
                  link: 'integration/event-handlers'
                }
              ]
            },
            {
              label: 'Local Playground',
              collapsed: true,
              autogenerate: {
                directory: 'playground'
              }
            },
            {
              label: 'Reference',
              collapsed: true,
              autogenerate: {
                directory: 'reference'
              }
            }
          ]
        },
        {
          label: 'Admin APIs',
          items: [
            {
              label: 'Backend Admin API',
              collapsed: true,
              autogenerate: {
                directory: 'apis/backend'
              }
            },
            {
              label: 'Auth Admin API',
              collapsed: true,
              autogenerate: {
                directory: 'apis/auth'
              }
            }
          ]
        }
      ]
    }),
    react(),
    GraphQL({
      schema: '../backend/src/graphql/schema.graphql',
      output: './src/content/docs/apis/backend/',
      linkPrefix: '/apis/backend/'
    }),
    GraphQL({
      schema: '../auth/src/graphql/schema.graphql',
      output: './src/content/docs/apis/auth/',
      linkPrefix: '/apis/auth/'
    })
  ],
  // Process images with sharp: https://docs.astro.build/en/guides/assets/#using-sharp
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp'
    }
  },
  server: {
    port: 1101
  }
})
