function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
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
  port: envInt('PORT', 3001),
  adminPort: envInt('ADMIN_PORT', 3002),
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/development'
  ),
  env: envString('NODE_ENV', 'development'),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  coilApiGrpcUrl: envString('COIL_API_GRPC_URL', 'localhost:6000'),
  nonceRedisKey: envString('NONCE_REDIS_KEY', 'nonceToProject'),
  tigerbeetleClientId: envString(
    'TIGERBEETLE_CLIENT_ID',
    'tigerbeetleClientId'
  ),
  tigerbeetleClusterId: envString(
    'TIGERBEETLE_CLUSTER_ID',
    'tigerbeetleClusterId'
  ),
  tigerbeetleReplicaAddresses: envArray('TIGERBEETLE_REPLICA_ADDRESSES', [
    '127.0.0.1:3001'
  ])
}
