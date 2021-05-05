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

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 3002),
  // adminPort: envInt('ADMIN_PORT', 3002),
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/development'
  ),
  env: envString('NODE_ENV', 'development')
}
