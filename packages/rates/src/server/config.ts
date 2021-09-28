export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3500')
}

export type Config = typeof config
