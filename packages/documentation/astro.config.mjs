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
          label: 'Rafiki Docs',
          items: [
            {
              label: 'Overview',
              items: [
                {
                  label: 'Introducing Rafiki',
                  link: '/overview/overview'
                },
                {
                  label: 'Concepts',
                  collapsed: true,
                  items: [
                    {
                      label: 'Accounts, transfers, and liquidity',
                      link: '/concepts/accounts-transfers-liquidity'
                    },
                    {
                      label: 'Interledger',
                      link: '/concepts/interledger'
                    },
                    {
                      label: 'Open Payments',
                      link: '/concepts/open-payments'
                    },
                    {
                      label: 'Telemetry',
                      link: '/concepts/telemetry'
                    }
                  ]
                }
              ]
            },
            {
              label: 'Integration',
              collapsed: true,
              items: [
                {
                  label: 'Before you begin',
                  link: '/integration/before-you-begin'
                },
                {
                  label: 'Get started',
                  collapsed: true,
                  items: [
                    {
                      label: 'Overview',
                      link: '/integration/get-started'
                    },
                    {
                      label: 'Fees',
                      link: '/integration/fees'
                    },
                    {
                      label: 'Exchange rates',
                      link: '/integration/exchange-rates'
                    },
                    {
                      label: 'Webhook events',
                      link: '/integration/webhook-events'
                    },
                    {
                      label: 'Identity provider (IdP)',
                      link: '/integration/idp'
                    }
                  ]
                },
                {
                  label: 'Deployment',
                  collapsed: true,
                  items: [
                    {
                      label: 'Requirements',
                      link: '/integration/deployment/requirements'
                    },
                    {
                      label: 'Services',
                      collapsed: true,
                      items: [
                        {
                          label: 'Auth service',
                          link: '/integration/deployment/services/auth-service'
                        },
                        {
                          label: 'Backend service',
                          link: '/integration/deployment/services/backend-service'
                        },
                        {
                          label: 'Frontend service',
                          link: '/integration/deployment/services/frontend-service'
                        },
                        {
                          label: 'Token introspection',
                          link: '/integration/deployment/services/token-introspection'
                        }
                      ]
                    },
                    {
                      label: 'Deploy locally',
                      collapsed: true,
                      items: [
                        {
                          label: 'Local playground overview',
                          link: '/integration/deployment/playground/overview'
                        },
                        {
                          label: 'Autopeering',
                          link: '/integration/deployment/playground/autopeering'
                        },
                        {
                          label: 'Test network',
                          link: '/integration/deployment/playground/testnet'
                        }
                      ]
                    },
                    {
                      label: 'Deploy to production',
                      items: [
                        {
                          label: 'Overview',
                          link: '/integration/deployment/prod/overview-prod'
                        },
                        {
                          label: 'Hardware',
                          link: '/integration/deployment/prod/hardware'
                        },
                        {
                          label: 'nginx',
                          link: '/integration/deployment/prod/nginx'
                        },
                        {
                          label: 'Helm and K8s',
                          link: '/integration/deployment/prod/helm-k8s'
                        }
                      ]
                    }
                  ]
                },
                {
                  label: 'Peering',
                  link: '/integration/peering'
                },
                {
                  label: 'Integration checklist',
                  link: '/integration/integration-checklist'
                },
                {
                  label: 'APIs',
                  link: '/integration/apis/'
                }
              ]
            },
            {
              label: 'Administration',
              collapsed: true,
              items: [
                {
                  label: 'Rafiki Admin',
                  link: '/admin/admin-user-guide'
                },
                {
                  label: 'Manage assets',
                  link: '/admin/manage-assets'
                },
                {
                  label: 'Manage liquidity',
                  link: '/admin/manage-liquidity'
                },
                {
                  label: 'Manage peering relationships',
                  link: '/admin/manage-peering'
                },
                {
                  label: 'Manage keys',
                  link: '/admin/manage-keys'
                },
                {
                  label: 'Manage grants',
                  link: '/admin/manage-grants'
                },
                {
                  label: 'Manage wallet addresses',
                  link: '/admin/manage-wallet-addresses'
                }
              ]
            },
            {
              label: 'Resources',
              collapsed: true,
              items: [
                {
                  label: 'Glossary',
                  link: '/resources/glossary'
                },
                {
                  label: 'Architecture',
                  link: '/resources/architecture'
                },
                {
                  label: 'Environment variables',
                  link: '/resources/environment-variables'
                },
                {
                  label: 'Get involved',
                  link: '/resources/get-involved'
                }
              ]
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
