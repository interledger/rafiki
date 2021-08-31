function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 3002),
  // adminPort: envInt('ADMIN_PORT', 3002),
  postgresUrl: envString(
    'POSTGRES_URL',
    'postgresql://postgres:password@localhost:5432/development'
  ),
  env: envString('NODE_ENV', 'development'),
  hmacSecret: envString('ACCOUNTS_HMAC_SECRET', 'test'),
  ilpAddress: process.env.ILP_ADDRESS,
  peerAddresses: process.env.PEER_ADDRESSES
    ? JSON.parse(process.env.PEER_ADDRESSES)
    : [],
  tigerbeetleClusterId: envInt('TIGERBEETLE_CLUSTER_ID', 1),
  tigerbeetleReplicaAddresses: process.env.TIGERBEETLE_REPLICA_ADDRESSES
    ? JSON.parse(process.env.TIGERBEETLE_REPLICA_ADDRESSES)
    : ['3001']
}
