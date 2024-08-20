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
              label: 'Intro to Rafiki',
              collapsed: true,
              items: [
                {
                  label: 'Overview',
                  link: 'intro-to-rafiki/overview'
                },
                {
                  label: 'Account servicing entities',
                  link: 'intro-to-rafiki/account-servicing-entities'
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
                  label: 'Deploy to production',
                  collapsed: true,
                  items: [
                    {
                      label: 'Endpoints',
                      collapsed: true,
                      items: [
                        {
                          label: 'Webhook events',
                          link: 'integration/deploy-to-prod/webhook-events'
                        },
                        {
                          label: 'Exchange Rates',
                          link: 'integration/deploy-to-prod/exchange-rates'
                        },
                        {
                          label: 'IDP',
                          link: 'integration/deploy-to-prod/idp'
                        }
                      ]
                    },
                    {
                      label: 'Environment variables',
                      link: 'integration/environment-variables'
                    },
                    {
                      label: 'Deploying to cloud environment options',
                      collapsed: true,
                      items: [
                        {
                          label: 'nginx',
                          link: 'integration/deploy-to-cloud/nginx'
                        },
                        {
                          label: 'Helm & K8s',
                          link: 'integration/deploy-to-cloud/helm-k8s'
                        }
                      ]
                    },
                    {
                      label: 'Running your instance',
                      collapsed: true,
                      items: [
                        {
                          label: 'Adding asset',
                          link: 'integration/running-your-instance/adding-asset'
                        },
                        {
                          label: 'Adding peer',
                          link: 'integration/running-your-instance/adding-peer'
                        },
                        {
                          label:
                            'Creating wallet address (strategies for identity lookup)',
                          link: 'integration/running-your-instance/creating-wallet-address'
                        },
                        {
                          label: 'Managing liquidity',
                          link: 'integration/running-your-instance/managing-liquidity'
                        },
                        {
                          label: 'Keys management',
                          link: 'integration/running-your-instance/keys-management'
                        },
                        {
                          label: 'Grants management',
                          link: 'integration/running-your-instance/grants-management'
                        }
                      ]
                    }
                  ]
                },
                {
                  label: 'Admin APIs',
                  link: 'integration/admin-apis'
                },
                {
                  label: 'Integrator checklist',
                  link: 'integration/integrator-checklist'
                }
              ]
            },
            {
              label: 'Components',
              collapsed: true,
              items: [
                {
                  label: 'Accounts, transfers, and liquidity',
                  link: 'components/accounts-transfers-liquidity'
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
                  link: 'services-and-aux-packages/backend-service'
                },
                {
                  label: 'Auth service',
                  link: 'services-and-aux-packages/auth-service'
                },
                {
                  label: 'Frontend service',
                  link: 'services-and-aux-packages/frontend-service'
                },
                {
                  label: 'Token introspection',
                  link: 'services-and-aux-packages/token-introspection'
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
              label: 'Admin APIs',
              collapsed: true,
              items: [
                {
                  label: 'GraphQL APIs',
                  collapsed: true,
                  items: [
                    {
                      label: 'Idempotency',
                      link: 'apis/graphql/idempotency'
                    },
                    {
                      label: 'Backend Admin API',
                      collapsed: true,
                      autogenerate: {
                        directory: 'apis/graphql/backend'
                      }
                    },
                    {
                      label: 'Auth Admin API',
                      collapsed: true,
                      autogenerate: {
                        directory: 'apis/graphql/auth'
                      }
                    }
                  ]
                },
                {
                  label: 'OpenAPIs',
                  link: 'apis/openapis'
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
        }
      ],
      plugins: [starlightLinksValidator()]
    }),
    GraphQL({
      schema: '../backend/src/graphql/schema.graphql',
      output: './src/content/docs/apis/graphql/backend/',
      linkPrefix: '/apis/graphql/backend/'
    }),
    GraphQL({
      schema: '../auth/src/graphql/schema.graphql',
      output: './src/content/docs/apis/graphql/auth/',
      linkPrefix: '/apis/graphql/auth/'
    })
  ],
  server: {
    port: 1101
  }
})
