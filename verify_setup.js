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

async function runQuery(query, variables = {}) {
  const body = { query, variables };
  const signature = generateSignature(body);

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'signature': signature,
      'tenant-id': TENANT_ID,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return data.data;
}

const VERIFY_SETUP = `
  query VerifySetup {
    tenants {
      edges {
        node {
          id
          publicName
        }
      }
    }
    peers {
      edges {
        node {
          id
          name
          staticIlpAddress
          asset {
            code
          }
        }
      }
    }
    assets {
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
  const result = await runQuery(VERIFY_SETUP);
  console.log('--- Verification Results ---');
  
  const cooperatives = ['Coop-A', 'Coop-B', 'Coop-C'];
  const results = {
    tenants: result.tenants.edges.map(e => ({ id: e.node.id, name: e.node.publicName })),
    assets: result.assets.edges.map(e => ({ id: e.node.id, code: e.node.code })),
    peers: result.peers.edges.map(e => ({ name: e.node.name, address: e.node.staticIlpAddress, asset: e.node.asset.code }))
  };

  console.log('Tenants:', JSON.stringify(results.tenants.filter(t => cooperatives.includes(t.name)), null, 2));
  console.log('NPR Assets:', JSON.stringify(results.assets.filter(a => a.code === 'NPR'), null, 2));
  console.log('Internal Peers:', JSON.stringify(results.peers.filter(p => p.name && p.name.startsWith('Peer to')), null, 2));
}

main().catch(console.error);
