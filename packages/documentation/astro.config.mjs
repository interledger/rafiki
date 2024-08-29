import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'
import GraphQL from 'astro-graphql-plugin'
import starlightLinksValidator from 'starlight-links-validator'

// https://astro.build/config
export default defineConfig({
  site: 'https://rafiki.dev',
  outDir: './build',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax]
  },
  integrations: [
    starlight({
      title: 'Rafiki',
      description:
        'Rafiki is open source software that allows an Account Servicing Entity to enable Interledger functionality on its users’ accounts.',
      customCss: [
        './node_modules/@interledger/docs-design-system/src/styles/orange-theme.css',
        './node_modules/@interledger/docs-design-system/src/styles/ilf-docs.css',
        './src/styles/rafiki.css'
      ],
      expressiveCode: {
        styleOverrides: {
          borderColor: 'transparent',
          borderRadius: 'var(--border-radius)'
        }
      },
      components: {
        Header: './src/components/Header.astro'
      },
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
                  label: 'Webhook Events',
                  link: 'integration/webhook-events'
                }
              ]
            },
            {
              label: 'Telemetry',
              collapsed: true,
              items: [
                { label: 'Overview', link: 'telemetry/overview' },
                { label: 'Privacy', link: 'telemetry/privacy' },
                {
                  label: 'Deploying Custom Telemetry',
                  link: 'telemetry/integrating'
                }
              ]
            },
            {
              label: 'Local Playground',
              collapsed: true,
              items: [
                {
                  label: 'Overview',
                  link: 'playground/overview'
                },
                {
                  label: 'Auto-Peering',
                  link: 'playground/autopeering'
                }
              ]
            },
            {
              label: 'Rafiki Admin',
              collapsed: true,
              items: [
                {
                  label: 'Overview',
                  link: 'rafikiadmin/overview'
                },
                {
                  label: 'Rafiki Admin Auth',
                  link: 'rafikiadmin/auth'
                }
              ]
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
              label: 'Idempotency',
              link: 'apis/idempotency'
            },
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
      ],
      plugins: [starlightLinksValidator()]
    }),
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
  server: {
    port: 1101
  }
})
