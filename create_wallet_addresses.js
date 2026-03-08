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

  const data = await response.json();
  if (data.errors) {
    console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
    return null;
  }
  return data.data;
}

const CREATE_WALLET_ADDRESS = `
  mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
    createWalletAddress(input: $input) {
      walletAddress {
        id
        address
      }
    }
  }
`;

const tenants = {
  "Coop-A": {
    "id": "b577b545-0177-48a0-992d-4a34f0283d79",
    "assetId": "d962c94d-a43c-4361-8065-442a5bcc6271"
  },
  "Coop-B": {
    "id": "beed38fc-9bb4-42b3-9d3c-80c0b26fd542",
    "assetId": "944cef4b-6ae6-46e6-a29e-0ef366892b57"
  },
  "Coop-C": {
    "id": "682f4722-2805-40cb-8e95-8e090ac44c62",
    "assetId": "869d8396-eac0-4e70-959f-233a3c9463aa"
  }
};

async function main() {
  console.log('--- Creating Wallet Addresses ---');
  const baseWalletAddressUrl = 'https://cloud-nine-wallet-backend/.well-known/pay';

  for (const [name, data] of Object.entries(tenants)) {
    const slug = name.toLowerCase().replace('-', '') + '-nifn';
    const address = `${baseWalletAddressUrl}/${slug}`;
    
    console.log(`Creating wallet address for ${name}: ${address}...`);
    
    const result = await runMutation(CREATE_WALLET_ADDRESS, {
      input: {
        tenantId: data.id,
        assetId: data.assetId,
        address: address,
        publicName: `${name} Wallet`
      }
    });

    if (result && result.createWalletAddress.walletAddress) {
      console.log(`SUCCESS: Created wallet address for ${name}: ${result.createWalletAddress.walletAddress.id}`);
      data.walletAddressId = result.createWalletAddress.walletAddress.id;
      data.walletAddress = result.createWalletAddress.walletAddress.address;
    } else {
      console.error(`FAILED: Could not create wallet address for ${name}`);
    }
  }

  console.log('--- Wallet Address Creation Complete ---');
  console.log('Final Data:', JSON.stringify(tenants, null, 2));
}

main().catch(console.error);
