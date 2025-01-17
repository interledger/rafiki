import { Form, useActionData, useNavigation } from '@remix-run/react'
import { useRef, useState, useEffect } from 'react'
import { Input, Button } from '~/components/ui'
import { validate as validateUUID } from 'uuid'

interface ApiCredentialsFormProps {
  showClearCredentials: boolean
  defaultTenantId: string
  defaultApiSecret: string
}

interface ActionErrorResponse {
  status: number
  statusText: string
}

export const ApiCredentialsForm = ({
  showClearCredentials,
  defaultTenantId,
  defaultApiSecret
}: ApiCredentialsFormProps) => {
  const actionData = useActionData<ActionErrorResponse>()
  const navigation = useNavigation()
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [tenantIdError, setTenantIdError] = useState<string | null>(null)

  const isSubmitting = navigation.state === 'submitting'

  const handleTenantIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const tenantId = event.target.value.trim()

    if (tenantId === '') {
      setTenantIdError('Tenant ID is required')
    } else if (!validateUUID(tenantId)) {
      setTenantIdError('Invalid Tenant ID (must be a valid UUID)')
    } else {
      setTenantIdError(null)
    }
  }

  // auto submit form if values passed in
  useEffect(() => {
    if (defaultTenantId && defaultApiSecret && !tenantIdError) {
      if (formRef.current) {
        formRef.current.submit()
      }
    }
  }, [defaultTenantId, defaultApiSecret, tenantIdError])

  return (
    <div className='space-y-4'>
      {showClearCredentials ? (
        <Form method='post' action='/api/set-credentials' className='space-y-4'>
          <p className='text-green-600'>✓ API credentials configured</p>
          <input hidden readOnly name='intent' value='clear' />
          <Button
            type='submit'
            intent='danger'
            aria-label='Clear API credentials'
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Clear Credentials'}
          </Button>
        </Form>
      ) : (
        <Form
          method='post'
          action='/api/set-credentials'
          className='space-y-4'
          ref={formRef} // Reference for the credentials form
        >
          <Input
            ref={inputRef}
            required
            type='text'
            name='tenantId'
            label='Tenant ID'
            defaultValue={defaultTenantId}
            onChange={handleTenantIdChange}
            aria-invalid={!!tenantIdError}
            aria-describedby={tenantIdError ? 'tenantId-error' : undefined}
          />
          {tenantIdError && (
            <p id='tenantId-error' className='text-red-500 text-sm'>
              {tenantIdError}
            </p>
          )}
          <Input
            required
            type='password'
            name='apiSecret'
            label='API Secret'
            defaultValue={defaultApiSecret}
          />
          <input hidden readOnly name='intent' value='save' />
          <div className='flex justify-center'>
            <Button
              type='submit'
              aria-label='Save API credentials'
              disabled={!!tenantIdError || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Save Credentials'}
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
