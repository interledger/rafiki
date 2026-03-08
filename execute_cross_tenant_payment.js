const crypto = require('crypto');

const GRAPHQL_URL = 'http://127.0.0.1:3001/graphql';

const tenants = {
  "Coop-A": {
    "id": "b577b545-0177-48a0-992d-4a34f0283d79",
    "apiSecret": "qm21iN5frFLxsNSiw29z5Y7E9crazHW9uTchCnmh6oA=",
    "walletAddressId": "32a1e22d-585e-429c-bfd4-8059d7099e89",
    "walletAddress": "https://cloud-nine-wallet-backend/.well-known/pay/coopa-nifn"
  },
  "Coop-B": {
    "id": "beed38fc-9bb4-42b3-9d3c-80c0b26fd542",
    "apiSecret": "J1V7dsZdfa1PEb972mRSZfJVxEqeswi5tzoJBBVbCFw=",
    "walletAddressId": "e82dbe0f-b580-4af0-9db6-b6cadda74144",
    "walletAddress": "https://cloud-nine-wallet-backend/.well-known/pay/coopb-nifn"
  }
};

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

function generateSignature(body, secret) {
  const timestamp = Date.now();
  const payload = `${timestamp}.${canonicalize(body)}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const digest = hmac.digest('hex');
  return `t=${timestamp}, v1=${digest}`;
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

async function runMutation(tenantName, query, variables = {}) {
  const tenant = tenants[tenantName];
  const body = { query, variables };
  const signature = generateSignature(body, tenant.apiSecret);

  log(`[Mutation] Requesting for ${tenantName}...`);
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'signature': signature,
      'tenant-id': tenant.id,
    },
    body: JSON.stringify(body),
  });

  log(`[Mutation] Response status for ${tenantName}: ${response.status}`);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    log(`Failed to parse response from ${tenantName}: ${text}`);
    throw new Error(`Invalid JSON response from ${tenantName}`);
  }

  if (data.errors) {
    log(`GraphQL Errors for ${tenantName}: ${JSON.stringify(data.errors, null, 2)}`);
    throw new Error(`GraphQL Mutation Failed for ${tenantName}`);
  }
  return data.data;
}

const CREATE_INCOMING_PAYMENT = `
  mutation CreateIncomingPayment($input: CreateIncomingPaymentInput!) {
    createIncomingPayment(input: $input) {
      payment {
        id
      }
    }
  }
`;

const CREATE_QUOTE = `
  mutation CreateQuote($input: CreateQuoteInput!) {
    createQuote(input: $input) {
      quote {
        id
      }
    }
  }
`;

const CREATE_OUTGOING_PAYMENT = `
  mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
    createOutgoingPayment(input: $input) {
      payment {
        id
        state
      }
    }
  }
`;

const DEPOSIT_OUTGOING_PAYMENT_LIQUIDITY = `
  mutation DepositOutgoingPaymentLiquidity($input: DepositOutgoingPaymentLiquidityInput!) {
    depositOutgoingPaymentLiquidity(input: $input) {
      success
    }
  }
`;

const GET_OUTGOING_PAYMENT = `
  query GetOutgoingPayment($id: String!) {
    outgoingPayment(id: $id) {
      id
      state
      error
    }
  }
`;

async function main() {
  console.log('--- Orchestrating Cross-Tenant Payment (Coop-A -> Coop-B) ---');

  // 1. Create Incoming Payment on Coop-B
  console.log('Step 1: Creating Incoming Payment on Coop-B (Signed as Coop-B)...');
  const incomingResult = await runMutation("Coop-B", CREATE_INCOMING_PAYMENT, {
    input: {
      walletAddressId: tenants["Coop-B"].walletAddressId,
      incomingAmount: {
        value: "1000",
        assetCode: "NPR",
        assetScale: 2
      },
      expiresAt: new Date(Date.now() + 600000).toISOString()
    }
  });
  const incomingPaymentId = incomingResult.createIncomingPayment.payment.id;
  const incomingPaymentUrl = `${tenants["Coop-B"].walletAddress}/incoming-payments/${incomingPaymentId}`;
  console.log(`SUCCESS: Incoming Payment URL: ${incomingPaymentUrl}`);

  // 2. Create Quote on Coop-A
  console.log('Step 2: Creating Quote on Coop-A (Signed as Coop-A)...');
  const quoteResult = await runMutation("Coop-A", CREATE_QUOTE, {
    input: {
      walletAddressId: tenants["Coop-A"].walletAddressId,
      receiver: incomingPaymentUrl
    }
  });
  const quoteId = quoteResult.createQuote.quote.id;
  console.log(`SUCCESS: Quote ID: ${quoteId}`);

  // 3. Create Outgoing Payment on Coop-A
  console.log('Step 3: Executing Outgoing Payment on Coop-A (Signed as Coop-A)...');
  const outgoingResult = await runMutation("Coop-A", CREATE_OUTGOING_PAYMENT, {
    input: {
      walletAddressId: tenants["Coop-A"].walletAddressId,
      quoteId: quoteId
    }
  });
  const payment = outgoingResult.createOutgoingPayment.payment;
  console.log(`SUCCESS: Payment ID: ${payment.id}, State: ${payment.state}`);

  // 4. Deposit Liquidity on Coop-A
  console.log('Step 4: Depositing Liquidity for Outgoing Payment (Signed as Coop-A)...');
  const depositResult = await runMutation("Coop-A", DEPOSIT_OUTGOING_PAYMENT_LIQUIDITY, {
    input: {
      outgoingPaymentId: payment.id,
      idempotencyKey: crypto.randomUUID()
    }
  });

  if (!depositResult.depositOutgoingPaymentLiquidity?.success) {
    console.error(`FAILED: Liquidity deposit was not successful.`);
  } else {
    console.log('SUCCESS: Liquidity deposited.');
  }

  // 5. Poll for completion
  console.log('Step 5: Verifying Payment Completion...');
  let finalPayment;
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = await runMutation("Coop-A", GET_OUTGOING_PAYMENT, { id: payment.id });
    finalPayment = result.outgoingPayment;
    console.log(`Current State: ${finalPayment.state}`);
    if (finalPayment.state === 'COMPLETED' || finalPayment.state === 'FAILED') {
      break;
    }
  }

  if (finalPayment.state === 'COMPLETED') {
    console.log('--- CROSS-TENANT PAYMENT SUCCESSFUL! ---');
  } else {
    console.log(`--- Payment ended in state: ${finalPayment.state} ---`);
    if (finalPayment.error) console.log(`Error: ${finalPayment.error}`);
  }

  console.log('--- Payment Flow Orchestration Complete ---');
}

main().catch(err => {
  console.error('Flow failed:', err.message);
});
