const crypto = require('crypto');

const OPERATOR_TENANT_ID = '438fa74a-fa7d-4317-9ced-dde32ece1787';
const OPERATOR_API_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964=';
const GRAPHQL_URL = 'http://127.0.0.1:3001/graphql';

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

async function runMutation(query, variables = {}) {
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

const DEPOSIT_LIQUIDITY = `
  mutation DepositAssetLiquidity($input: DepositAssetLiquidityInput!) {
    depositAssetLiquidity(input: $input) {
      success
    }
  }
`;

const assets = [
  { name: 'Coop-A NPR', id: 'd962c94d-a43c-4361-8065-442a5bcc6271' },
  { name: 'Coop-B NPR', id: '944cef4b-6ae6-46e6-a29e-0ef366892b57' },
  { name: 'Coop-C NPR', id: '869d8396-eac0-4e70-959f-233a3c9463aa' }
];

async function main() {
  console.log('--- Funding Assets ---');
  for (const asset of assets) {
    console.log(`Funding ${asset.name} (${asset.id})...`);
    const result = await runMutation(DEPOSIT_LIQUIDITY, {
      input: {
        assetId: asset.id,
        amount: "1000000",
        id: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID()
      }
    });
    if (result && result.depositAssetLiquidity && result.depositAssetLiquidity.success) {
      console.log(`SUCCESS: Funded ${asset.name}`);
    } else {
      console.error(`FAILED: Could not fund ${asset.name}`);
    }
  }
}

main().catch(console.error);
