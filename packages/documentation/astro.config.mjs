import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'
import GraphQL from 'astro-graphql-plugin'

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
              label: 'Intro to Rafiki',
              collapsed: true,
              items: [
                {
                  label: 'Overview',
                  link: 'introduction/overview'
                },
                {
                  label: 'Account servicing entities',
                  link: 'introduction/account-servicing-entity'
                }
              ]
            },
            {
              label: 'Integration',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  link: 'integration/get-started'
                },
                {
                  label: 'Deploy to Production',
                  collapsed: true,
                  items: [
                    {
                      label: 'Endpoints',
                      collapsed: true,
                      items: [
                        {
                          label: 'Webhook events',
                          link: 'integration/webhooks'
                        },
                        {
                          label: 'Exchange rates',
                          link: 'integration/exchange-rates'
                        },
                        {
                          label: 'IDP',
                          link: 'integration/idp'
                        }
                      ]
                    },
                    {
                      label: 'Environment variables',
                      link: 'integration/variables'
                    },
                    {
                      label: 'Deploying to cloud environment options',
                      collapsed: true,
                      items: [
                        {
                          label: 'nginx',
                          link: 'integration/nginx'
                        },
                        {
                          label: 'Helm and K8s',
                          link: 'integration/helm-k8s'
                        }
                      ]
                    },
                    {
                      label: 'Running your instance',
                      collapsed: true,
                      items: [
                        {
                          label: 'Adding asset',
                          link: 'integration/adding-asset'
                        },
                        {
                          label: 'Adding peer',
                          link: 'integration/adding-peer'
                        },
                        {
                          label:
                            'Creating wallet addresses (strategies for identity lookup)',
                          link: 'integration/creating-wallet-addresses'
                        },
                        {
                          label: 'Adding liquidity',
                          link: 'integration/adding-liquidity'
                        }
                      ]
                    }
                  ]
                },
                {
                  label: 'Admin API',
                  link: 'integration/admin-api'
                },
                {
                  label: 'Integrator checklist',
                  link: 'integration/checklist'
                }
              ]
            },
            {
              label: 'Components',
              collapsed: true,
              items: [
                {
                  label: 'Assets and accounting',
                  link: 'components/assets-and-accounting'
                },
                {
                  label: 'Telemetry',
                  link: 'components/telemetry'
                },
                {
                  label: 'Interledger',
                  link: 'components/interledger'
                },
                {
                  label: 'Open Payments',
                  link: 'components/open-payments'
                },
                {
                  label: 'Architecture',
                  link: 'components/architecture'
                }
              ]
            },
            {
              label: 'Services and Auxiliary Packages',
              collapsed: true,
              items: [
                {
                  label: 'Backend service',
                  link: 'services/backend-service'
                },
                {
                  label: 'Auth service',
                  link: 'services/auth-service'
                },
                {
                  label: 'Frontend service',
                  link: 'services/frontend-service'
                },
                {
                  label: 'Other',
                  collapsed: true,
                  items: [
                    {
                      label: 'Token introspection',
                      link: 'services/token-introspection'
                    }
                  ]
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
                },
                {
                  label: 'Testnet',
                  link: 'playground/testnet'
                }
              ]
            },
            {
              label: 'APIs',
              collapsed: true,
              items: [
                {
                  label: 'GraphQL APIs',
                  link: 'apis/graphql-api'
                },
                {
                  label: 'OpenAPIs',
                  link: 'apis/openapi'
                }
              ]
            },
            {
              label: 'Resources',
              collapsed: true,
              items: [
                {
                  label: 'Glossary',
                  link: 'resources/glossary'
                }
              ]
            }
          ]
        }
      ]
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
