import { Form, useActionData, useNavigation } from '@remix-run/react'
import { useRef, useState } from 'react'
import { Input, Button } from '~/components/ui'
import { validate as validateUUID } from 'uuid'

interface ApiCredentialsFormProps {
  hasCredentials: boolean
}

interface ActionErrorResponse {
  status: number
  statusText: string
}

export const ApiCredentialsForm = ({
  hasCredentials
}: ApiCredentialsFormProps) => {
  const actionData = useActionData<ActionErrorResponse>()
  const navigation = useNavigation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tenantIdError, setTenantIdError] = useState<string | null>(null)

  const handleTenantIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const tenantId = event.target.value
    if (tenantId === '') {
      setTenantIdError('Tenant ID is required')
      return
    }

    if (!validateUUID(tenantId)) {
      setTenantIdError('Invalid Tenant ID (must be a valid UUID)')
    } else {
      setTenantIdError(null)
    }
  }

  return (
    <div className='space-y-4'>
      {hasCredentials ? (
        <Form method='post' className='space-y-4'>
          <p className='text-green-600'>✓ API credentials configured</p>
          <Button
            name='intent'
            value='clear'
            type='submit'
            intent='danger'
            aria-label='clear'
          >
            {navigation.state === 'submitting'
              ? 'Submitting...'
              : 'Clear Credentials'}
          </Button>
        </Form>
      ) : (
        <Form method='post' className='space-y-4'>
          <Input
            ref={inputRef}
            required
            type='text'
            name='tenantId'
            label='Tenant ID'
            onChange={handleTenantIdChange}
            aria-invalid={!!tenantIdError}
            aria-describedby={tenantIdError ? 'tenantId-error' : undefined}
          />
          {tenantIdError && (
            <p id='tenantId-error' className='text-red-500 text-sm'>
              {tenantIdError}
            </p>
          )}
          <Input required type='password' name='apiSecret' label='API Secret' />
          <div className='flex justify-center'>
            <Button
              type='submit'
              name='intent'
              value='save'
              aria-label='submit'
              disabled={!!tenantIdError}
            >
              {navigation.state === 'submitting'
                ? 'Submitting...'
                : 'Save Credentials'}
            </Button>
          </div>
        </Form>
      )}
      {actionData?.statusText && (
        <div className='text-red-500'>{actionData.statusText}</div>
      )}
    </div>
  )
}
