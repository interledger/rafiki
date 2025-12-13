interface Tenant {
  id: string
  apiSecret: string
  idpConsentUrl?: string
  idpSecret?: string
}

export class AuthServiceClientError extends Error {
  constructor(
    message: string,
    public status: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public details?: any
  ) {
    super(message)
    this.status = status
    this.details = details
  }
}

export class AuthServiceClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request<T>(path: string, options: RequestInit): Promise<T> {
    options.headers = { 'Content-Type': 'application/json', ...options.headers }

    const response = await fetch(`${this.baseUrl}${path}`, options)

    if (!response.ok) {
      let errorDetails
      try {
        errorDetails = await response.json()
      } catch {
        errorDetails = { message: response.statusText }
      }

      throw new AuthServiceClientError(
        `Auth Service Client Error: ${response.status} ${response.statusText}`,
        response.status,
        errorDetails
      )
    }

    if (
      response.status === 204 ||
      response.headers.get('Content-Length') === '0'
    ) {
      return undefined as T
    }

    const contentType = response.headers.get('Content-Type')
    if (contentType && contentType.includes('application/json')) {
      try {
        return (await response.json()) as T
      } catch (error) {
        throw new AuthServiceClientError(
          `Failed to parse JSON response from ${path}`,
          response.status
        )
      }
    }

    return (await response.text()) as T
  }

  public tenant = {
    create: (data: Tenant) =>
      this.request('/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }),
    update: (id: string, data: Partial<Omit<Tenant, 'id'>>) =>
      this.request(`/tenant/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }),
    delete: (id: string, deletedAt: Date) =>
      this.request(`/tenant/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt })
      })
  }
}
