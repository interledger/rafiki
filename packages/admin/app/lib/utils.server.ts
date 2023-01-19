// Obscures the auth token in the loader before sending it to the frontend
export function obscureAuthToken(token: string): string {
  if (token.length < 5) {
    return token.replace(/./g, '*')
  } else {
    return token.replace(/(?<=...)./g, '*')
  }
}
