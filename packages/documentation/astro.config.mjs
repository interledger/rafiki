import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'
import starlightLinksValidator from 'starlight-links-validator'
import starlightFullViewMode from 'starlight-fullview-mode'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'

// https://astro.build/config
export default defineConfig({
  site: 'https://rafiki.dev',
  outDir: './build',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      rehypeMathjax,
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap'
        }
      ]
    ]
  },
  integrations: [
    starlight({
      title: 'Rafiki',
      description:
        'Rafiki is open source software that allows an Account Servicing Entity to enable Interledger functionality on its users’ accounts.',
      customCss: [
        './node_modules/@interledger/docs-design-system/src/styles/teal-theme.css',
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
        Header: './src/components/Header.astro',
        PageSidebar: './src/components/PageSidebar.astro'
      },
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en'
        },
        es: {
          label: 'Español'
        }
      },
      head: [
        {
          tag: 'script',
          attrs: {
            src: '/scripts.js',
            defer: true
          }
        },
        {
          tag: 'script',
          attrs: {
            defer: true,
            'data-website-id': '75fba178-7dca-4874-adc9-50cf85c83528',
            src: 'https://ilf-site-analytics.netlify.app/script.js',
            'data-domains': 'rafiki.dev'
          }
        }
      ],
      logo: {
        src: './public/img/icon.svg'
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/interledger/rafiki/tree/main'
        }
      ],
      sidebar: [
        {
          label: 'Overview',
          translations: {
            es: 'Introducción'
          },
          items: [
            {
              label: 'Introducing Rafiki',
              translations: {
                es: 'Sobre Rafiki'
              },
              link: '/overview/overview'
            },
            {
              label: 'Concepts',
              translations: {
                es: 'Conceptos'
              },
              collapsed: true,
              items: [
                {
                  label: 'Account servicing entity',
                  translations: {
                    es: 'Servicio de Cuentas de Entidad (ASE)'
                  },
                  link: '/overview/concepts/account-servicing-entity'
                },
                {
                  label: 'Accounting',
                  translations: {
                    es: 'Transacciones en Rafiki'
                  },
                  link: '/overview/concepts/accounting'
                },
                {
                  label: 'Clearing and settlement',
                  translations: {
                    es: 'Compensación y liquidación'
                  },
                  link: '/overview/concepts/clearing-settlement'
                },
                {
                  label: 'Interledger',
                  translations: {
                    es: 'Interledger'
                  },
                  link: '/overview/concepts/interledger'
                },
                {
                  label: 'Open Payments',
                  translations: {
                    es: 'Pagos Abiertos'
                  },
                  link: '/overview/concepts/open-payments'
                },
                {
                  label: 'Payment pointers and wallet addresses',
                  translations: {
                    es: 'Apuntadores de pago y direcciones de billeteras'
                  },
                  link: '/overview/concepts/payment-pointers'
                },
                {
                  label: 'Telemetry',
                  translations: {
                    es: 'Telemetría'
                  },
                  link: '/overview/concepts/telemetry'
                }
              ]
            }
          ]
        },
        {
          label: 'Deploy Rafiki',
          collapsed: true,
          items: [
            {
              label: 'Docker Compose',
              link: '/integration/deployment/docker-compose'
            },
            {
              label: 'Helm and Kubernetes',
              link: '/integration/deployment/helm-k8s'
            }
          ]
        },
        {
          label: 'Integration',
          collapsed: true,
          items: [
            {
              label: 'Requirements',
              collapsed: true,
              items: [
                {
                  label: 'Overview and checklist',
                  link: '/integration/requirements/overview'
                },
                {
                  label: 'Assets',
                  link: '/integration/requirements/assets'
                },
                {
                  label: 'Peers',
                  link: '/integration/requirements/peers'
                },
                {
                  label: 'Wallet addresses',
                  link: '/integration/requirements/wallet-addresses'
                },
                {
                  label: 'Webhook events',
                  link: '/integration/requirements/webhook-events'
                },
                {
                  label: 'Exchange rates',
                  link: '/integration/requirements/exchange-rates'
                },
                {
                  label: 'Sending fees',
                  link: '/integration/requirements/sending-fees'
                },
                {
                  label: 'Open Payments',
                  collapsed: true,
                  items: [
                    {
                      label: 'Identity provider (IdP)',
                      link: '/integration/requirements/open-payments/idp'
                    },
                    {
                      label: 'Managing wallet address keys',
                      link: '/integration/requirements/open-payments/wallet-keys'
                    },
                    {
                      label: 'Viewing and revoking grants',
                      link: '/integration/requirements/open-payments/grants-revoking'
                    }
                  ]
                }
              ]
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
                }
              ]
            },
            {
              label: 'Test locally',
              collapsed: true,
              items: [
                {
                  label: 'Local playground',
                  link: '/integration/playground/overview'
                },
                {
                  label: 'Autopeering',
                  link: '/integration/playground/autopeering'
                },
                {
                  label: 'Test network',
                  link: '/integration/playground/testnet'
                }
              ]
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
              label: 'Manage liquidity',
              collapsed: true,
              items: [
                {
                  label: 'Asset liquidity',
                  link: '/admin/liquidity/asset-liquidity'
                },
                {
                  label: 'Peer liquidity',
                  link: '/admin/liquidity/peer-liquidity'
                },
                {
                  label: 'Payment liquidity',
                  link: '/admin/liquidity/payment-liquidity'
                },
                {
                  label: 'Two-phase transfers',
                  link: '/admin/liquidity/two-phase-transfers'
                }
              ]
            }
          ]
        },
        {
          label: 'APIs',
          collapsed: true,
          items: [
            {
              label: 'GraphQL Admin APIs',
              link: '/apis/graphql/admin-api-overview'
            },
            {
              label: 'Backend Admin API',
              link: '/apis/graphql/backend',
              attrs: {
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-icon': 'external'
              }
            },
            {
              label: 'Auth Admin API',
              link: '/apis/graphql/auth',
              attrs: {
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-icon': 'external'
              }
            }
          ]
        },
        {
          label: 'Resources',
          collapsed: true,
          items: [
            {
              label: 'Releases',
              link: '/resources/releases'
            },
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
              label: 'Webhook event types',
              link: '/resources/webhook-event-types'
            },
            {
              label: 'Get involved',
              link: '/resources/get-involved'
            }
          ]
        }
      ],
      plugins: [
        starlightLinksValidator({
          exclude: [
            '/apis/graphql/auth',
            '/apis/graphql/backend',
            '/apis/graphql/auth/*',
            '/apis/graphql/backend/*'
          ],
          errorOnLocalLinks: false,
          errorOnFallbackPages: false,
          errorOnInvalidHashes: false
        }),
        starlightFullViewMode()
      ]
    })
  ],
  server: {
    port: 1101
  }
})
