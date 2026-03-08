const crypto = require('crypto');

const OPERATOR_TENANT_ID = '438fa74a-fa7d-4317-9ced-dde32ece1787';
const OPERATOR_API_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964=';
const GRAPHQL_URL = 'http://localhost:3001/graphql';

function canonicalize(obj) {
  const normalized = JSON.parse(JSON.stringify(obj));
  return _canonicalize(normalized);
}

function _canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(_canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => `"${key}":${_canonicalize(obj[key])}`).join(',') + '}';
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

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.data;
  } catch (err) {
    console.error('Failed to parse response:', text);
    throw err;
  }
}

const GET_TENANTS = `
  query GetTenants {
    tenants {
      edges {
        node {
          id
          publicName
          apiSecret
        }
      }
    }
  }
`;

async function main() {
  console.log('--- Fetching Tenant Secrets ---');
  const result = await runQuery(GET_TENANTS);
  const cooperatives = ['Coop-A', 'Coop-B', 'Coop-C'];
  const mapping = {};

  result.tenants.edges.forEach(edge => {
    if (cooperatives.includes(edge.node.publicName)) {
      mapping[edge.node.publicName] = {
        id: edge.node.id,
        apiSecret: edge.node.apiSecret
      };
    }
  });

  console.log('Tenant Secrets Mapping:', JSON.stringify(mapping, null, 2));
}

main().catch(console.error);
