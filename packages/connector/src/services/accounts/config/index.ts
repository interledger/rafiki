function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

function envBigInt(name: string, value: bigint): bigint {
  const envValue = process.env[name]
  return envValue == null ? value : BigInt(envValue)
}

// function envBool(name: string, value: boolean): boolean {
//   const envValue = process.env[name]
//   return envValue == null ? value : Boolean(envValue)
// }

function envArray(name: string, value: string[]): string[] {
  const envValue = process.env[name]
  return envValue == null ? value : envValue.split(' ')
}

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 3002),
  // adminPort: envInt('ADMIN_PORT', 3002),
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/development'
  ),
  env: envString('NODE_ENV', 'development'),
  tigerbeetleClientId: envBigInt('TIGERBEETLE_CLIENT_ID', 0x0a5ca1ab1ebee11en),
  tigerbeetleClusterId: envBigInt(
    'TIGERBEETLE_CLUSTER_ID',
    0x0a5ca1ab1ebee11en
  ),
  tigerbeetleReplicaAddresses: envArray('TIGERBEETLE_REPLICA_ADDRESSES', [
    '3001'
  ])
}
