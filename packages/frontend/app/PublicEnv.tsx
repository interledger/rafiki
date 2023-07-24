export interface PublicEnvironment {
  OPEN_PAYMENTS_URL: string
}

declare global {
  interface Window {
    ENV: PublicEnvironment
  }
}

type PublicEnvProps = {
  env: PublicEnvironment
}

export const PublicEnv = ({ env }: PublicEnvProps) => {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.ENV = ${JSON.stringify(env)}`
      }}
    />
  )
}
