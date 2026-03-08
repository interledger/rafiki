const crypto = require('crypto');

const OPERATOR_TENANT_ID = '438fa74a-fa7d-4317-9ced-dde32ece1787';
const OPERATOR_API_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964=';
const GRAPHQL_URL = 'http://localhost:3001/graphql';

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => `"${key}":${canonicalize(obj[key])}`).join(',') + '}';
}

function generateSignature(body) {
  const timestamp = Date.now();
  const payload = `${timestamp}.${canonicalize(body)}`;
  const hmac = crypto.createHmac('sha256', OPERATOR_API_SECRET);
  hmac.update(payload);
  const digest = hmac.digest('hex');
  return `t=${timestamp}, v1=${digest}`;
}

async function runQuery(query, variables = {}) {
  const body = { query, variables };
  const signature = generateSignature(body);

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'signature': signature,
      'tenant-id': OPERATOR_TENANT_ID,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return data.data;
}

const LIST_WALLET_ADDRESSES = `
  query ListWalletAddresses($tenantId: String) {
    walletAddresses(tenantId: $tenantId) {
      edges {
        node {
          id
          address
          publicName
        }
      }
    }
  }
`;

async function main() {
  console.log('--- Listing ALL Wallet Addresses ---');
  const result = await runQuery(LIST_WALLET_ADDRESSES, {});
  console.log(JSON.stringify(result.walletAddresses.edges.map(e => ({
    id: e.node.id,
    address: e.node.address,
    publicName: e.node.publicName
  })), null, 2));
}

main().catch(console.error);
