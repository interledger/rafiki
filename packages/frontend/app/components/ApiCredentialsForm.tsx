import { Form } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '~/components/ui'

export const ApiCredentialsForm = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hasCredentials, setHasCredentials] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(
        sessionStorage.getItem('tenantId') &&
        sessionStorage.getItem('apiSecret')
      )
    }
    return false
  })

  useEffect(() => {
    if (inputRef.current && !hasCredentials) {
      inputRef.current.focus()
    }
  }, [hasCredentials])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const tenantId = formData.get('tenantId') as string
    const apiSecret = formData.get('apiSecret') as string

    sessionStorage.setItem('tenantId', tenantId)
    sessionStorage.setItem('apiSecret', apiSecret)
    setHasCredentials(true)
  }

  const handleClearCredentials = () => {
    sessionStorage.removeItem('tenantId')
    sessionStorage.removeItem('apiSecret')
    setHasCredentials(false)
  }

  return (
    <div className='space-y-4'>
      {hasCredentials ? (
        <div className='space-y-4'>
          <p className='text-green-600'>✓ API credentials configured</p>
          <Button
            onClick={handleClearCredentials}
            intent='danger'
            aria-label='clear'
          >
            Clear Credentials
          </Button>
        </div>
      ) : (
        <Form onSubmit={handleSubmit} className='space-y-4'>
          <Input
            ref={inputRef}
            required
            type='text'
            name='tenantId'
            label='Tenant ID'
          />
          <Input required type='password' name='apiSecret' label='API Secret' />
          <div className='flex justify-center'>
            <Button type='submit' aria-label='submit'>
              Save Credentials
            </Button>
          </div>
        </Form>
      )}
    </div>
  )
}
