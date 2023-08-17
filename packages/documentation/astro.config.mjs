import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import react from '@astrojs/react'
// import overrideIntegration from './src/overrideIntegration.mjs'

import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'

// https://astro.build/config
export default defineConfig({
  site: 'https://rafiki.dev',
  outDir: './build',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax]
  },
  integrations: [
    // overrideIntegration(), # TODO: figure out the path problem for this plugin
    starlight({
      title: 'Rafiki',
      customCss: ['./src/styles/ilf-docs.css', './src/styles/rafiki.css'],
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
              items: [
                {
                  label: 'Schema types',
                  link: 'apis/backend/schema/'
                }
              ]
            },
            {
              label: 'Auth Admin API',
              collapsed: true,
              items: [
                {
                  label: 'Schema types',
                  link: 'apis/auth/schema/'
                }
              ]
            }
          ]
        }
      ]
    }),
    react()
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
