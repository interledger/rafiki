import http from 'k6/http'
export const options = {
  // A number specifying the number of VUs to run concurrently.
  vus: 10,
  // A string specifying the total duration of the test run.
  duration: '30s'

  // The following section contains configuration options for execution of this
  // test script in Grafana Cloud.
  //
  // See https://grafana.com/docs/grafana-cloud/k6/get-started/run-cloud-tests-from-the-cli/
  // to learn about authoring and running k6 test scripts in Grafana k6 Cloud.
  //
  // cloud: {
  //   // The ID of the project to which the test is assigned in the k6 Cloud UI.
  //   // By default tests are executed in default project.
  //   projectID: "",
  //   // The name of the test in the k6 Cloud UI.
  //   // Test runs with the same name will be grouped.
  //   name: "script.js"
  // },

  // Uncomment this section to enable the use of Browser API in your tests.
  //
  // See https://grafana.com/docs/k6/latest/using-k6-browser/running-browser-tests/ to learn more
  // about using Browser API in your test scripts.
  //
  // scenarios: {
  //   // The scenario name appears in the result summary, tags, and so on.
  //   // You can give the scenario any name, as long as each name in the script is unique.
  //   ui: {
  //     // Executor is a mandatory parameter for browser-based tests.
  //     // Shared iterations in this case tells k6 to reuse VUs to execute iterations.
  //     //
  //     // See https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ for other executor types.
  //     executor: 'shared-iterations',
  //     options: {
  //       browser: {
  //         // This is a mandatory parameter that instructs k6 to launch and
  //         // connect to a chromium-based browser, and use it to run UI-based
  //         // tests.
  //         type: 'chromium',
  //       },
  //     },
  //   },
  // }
}

// The function that defines VU logic.
//
// See https://grafana.com/docs/k6/latest/examples/get-started-with-k6/ to learn more
// about authoring k6 scripts.
//
export default function () {
  const headers = {
    'Content-Type': 'application/json'
  }

  const CLOUD_NINE_GQL_ENDPOINT = 'http://cloud-nine-wallet-backend:3001/graphql'
  const CLOUD_NINE_WALLET_ADDRESS =
    'https://cloud-nine-wallet-backend/accounts/gfranklin'
  const HAPPY_LIFE_BANK_WALLET_ADDRESS =
    'https://happy-life-bank-backend/accounts/pfry'

  const c9WalletAddressesRes = http.post(
    CLOUD_NINE_GQL_ENDPOINT,
    JSON.stringify({
      query: `
    query GetWalletAddresses {
      walletAddresses {
        edges {
          node {
            id
            url
          }
        }
      }
    }
  `
    }),
    { headers }
  )
  const c9WalletAddresses = JSON.parse(c9WalletAddressesRes.body).data
    .walletAddresses.edges
  const c9WalletAddress = c9WalletAddresses.find(
    (edge) => edge.node.url === CLOUD_NINE_WALLET_ADDRESS
  ).node

  const createReceiverResponse = http.post(
    CLOUD_NINE_GQL_ENDPOINT,
    JSON.stringify({
      query: `
        mutation CreateReceiver($input: CreateReceiverInput!) {
          createReceiver(input: $input) {
            receiver {
              id
            }
          }
        }
      `,
      variables: {
        input: {
          expiresAt: null,
          metadata: {
            description: 'Hello my friend',
            externalRef: null
          },
          incomingAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 1002
          },
          walletAddressUrl: HAPPY_LIFE_BANK_WALLET_ADDRESS
        }
      }
    }),
    {
      headers
    }
  )
  const receiver = JSON.parse(createReceiverResponse.body).data.createReceiver
    .receiver

  const createQuoteResponse = http.post(
    CLOUD_NINE_GQL_ENDPOINT,
    JSON.stringify({
      query: `
        mutation CreateQuote($input: CreateQuoteInput!) {
          createQuote(input: $input) {
            quote {
              id
            }
          }
        }
      `,
      variables: {
        input: {
          walletAddressId: c9WalletAddress.id,
          receiveAmount: null,
          receiver: receiver.id,
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 500
          }
        }
      }
    }),
    {
      headers
    }
  )

  const quote = JSON.parse(createQuoteResponse.body).data.createQuote.quote

  http.post(
    CLOUD_NINE_GQL_ENDPOINT,
    JSON.stringify({
      query: `
        mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
          createOutgoingPayment(input: $input) {
            payment {
              id
            }
          }
        }
      `,
      variables: {
        input: {
          metadata: {
            description: null,
            externalRef: null
          },
          walletAddressId: c9WalletAddress.id,
          quoteId: quote.id
        }
      }
    }),
    { headers }
  )
}
