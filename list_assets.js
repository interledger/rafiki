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
  return JSON.parse(text).data;
}

const GET_ASSETS = `
  query GetAssets($tenantId: String) {
    assets(tenantId: $tenantId) {
      edges {
        node {
          id
          code
        }
      }
    }
  }
`;

async function main() {
  const tenants = {
    "Coop-A": "b577b545-0177-48a0-992d-4a34f0283d79",
    "Coop-B": "beed38fc-9bb4-42b3-9d3c-80c0b26fd542",
    "Coop-C": "682f4722-2805-40cb-8e95-8e090ac44c62"
  };

  console.log('--- Mapping Assets to Tenants ---');
  const mapping = {};

  for (const [name, id] of Object.entries(tenants)) {
    const result = await runQuery(GET_ASSETS, { tenantId: id });
    const nprAsset = result.assets.edges.find(e => e.node.code === 'NPR');
    if (nprAsset) {
      mapping[name] = {
        tenantId: id,
        assetId: nprAsset.node.id
      };
    }
  }

  console.log('Final Mapping:', JSON.stringify(mapping, null, 2));
}

main().catch(console.error);
