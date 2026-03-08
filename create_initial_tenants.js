const crypto = require('crypto');

const TENANT_ID = '438fa74a-fa7d-4317-9ced-dde32ece1787';
const API_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964=';
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
  const hmac = crypto.createHmac('sha256', API_SECRET);
  hmac.update(payload);
  const digest = hmac.digest('hex');
  return `t=${timestamp}, v1=${digest}`;
}

async function runMutation(query, variables = {}) {
  const body = { query, variables };
  const signature = generateSignature(body);

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'signature': signature,
        'tenant-id': TENANT_ID,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      const text = await response.text();
      console.error('Unauthorized:', text);
      return null;
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      return null;
    }
    return data.data;
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

const CREATE_TENANT = `
  mutation CreateTenant($input: CreateTenantInput!) {
    createTenant(input: $input) {
      tenant {
        id
      }
    }
  }
`;

const CREATE_ASSET = `
  mutation CreateAsset($input: CreateAssetInput!) {
    createAsset(input: $input) {
      asset {
        id
        code
        scale
      }
    }
  }
`;

const CREATE_PEER = `
  mutation CreatePeer($input: CreatePeerInput!) {
    createPeer(input: $input) {
      peer {
        id
      }
    }
  }
`;

async function main() {
  console.log('--- Starting Tenant Provisioning ---');

  const cooperatives = ['Coop-A', 'Coop-B', 'Coop-C'];
  const tenants = {};

  // 1. Create Tenants
  for (const name of cooperatives) {
    console.log(`Creating tenant: ${name}...`);
    const secret = crypto.randomBytes(32).toString('base64');
    const result = await runMutation(CREATE_TENANT, {
      input: { 
        publicName: name,
        apiSecret: secret
      }
    });
    if (result && result.createTenant.tenant) {
      const id = result.createTenant.tenant.id;
      tenants[name] = { id };
      console.log(`SUCCESS: ${name} created with ID: ${id}`);
    } else {
      console.error(`FAILED: Could not create tenant ${name}`);
    }
  }

  // 2. Create NPR Asset for each tenant
  for (const name of cooperatives) {
    const tenant = tenants[name];
    if (!tenant) continue;
    console.log(`Creating NPR asset for ${name} (${tenant.id})...`);
    const result = await runMutation(CREATE_ASSET, {
      input: {
        code: 'NPR',
        scale: 2,
        tenantId: tenant.id
      }
    });
    if (result && result.createAsset.asset) {
      tenant.assetId = result.createAsset.asset.id;
      console.log(`SUCCESS: NPR asset created for ${name}: ${tenant.assetId}`);
    } else {
      console.error(`FAILED: Could not create NPR asset for ${name}`);
    }
  }

  // 3. Configure Internal Peering
  console.log('--- Configuring Peering ---');
  const hubIlpPrefix = 'test.cloud-nine-wallet';
  
  for (const sourceName of cooperatives) {
    const sourceTenant = tenants[sourceName];
    if (!sourceTenant) continue;

    for (const targetName of cooperatives) {
      if (sourceName === targetName) continue;
      const targetTenant = tenants[targetName];
      if (!targetTenant) continue;

      const targetIlpAddress = `${hubIlpPrefix}.${targetTenant.id}`;
      console.log(`Peering ${sourceName} -> ${targetName} (${targetIlpAddress})...`);

      const result = await runMutation(CREATE_PEER, {
        input: {
          name: `Peer to ${targetName}`,
          staticIlpAddress: targetIlpAddress,
          assetId: sourceTenant.assetId,
          http: {
            incoming: { authTokens: [crypto.randomBytes(16).toString('hex')] },
            outgoing: { 
              endpoint: 'http://cloud-nine-wallet-backend:3002', 
              authToken: crypto.randomBytes(16).toString('hex') 
            }
          },
          initialLiquidity: "1000000"
        }
      });

      if (result && result.createPeer.peer) {
        console.log(`SUCCESS: Peer created for ${sourceName} -> ${targetName}`);
      } else {
        console.error(`FAILED: Could not create peer for ${sourceName} -> ${targetName}`);
      }
    }
  }

  console.log('--- Provisioning Complete ---');
  console.log('Final Setup:', JSON.stringify(tenants, null, 2));
}

main().catch(console.error);
