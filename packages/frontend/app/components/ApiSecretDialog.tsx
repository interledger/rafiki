import { Dialog } from '@headlessui/react'
import { Form } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import { XIcon } from '~/components/icons'
import { Button, Input } from '~/components/ui'

type ApiSecretDialogProps = {
  title: string
  onClose: (success?: boolean) => void
}

// TODO: rm if unused
export const ApiSecretDialog = ({ title, onClose }: ApiSecretDialogProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const tenantId = formData.get('tenantId') as string
    const apiSecret = formData.get('apiSecret') as string

    sessionStorage.setItem('tenantId', tenantId)
    sessionStorage.setItem('apiSecret', apiSecret)

    onClose(true) // Indicate successful save
  }

  return (
    <Dialog
      as='div'
      className='relative z-10'
      onClose={() => onClose(false)}
      open={true}
    >
      <div className='fixed inset-0 bg-tealish/30 bg-opacity-75 transition-opacity' />
      <div className='fixed inset-0 z-10 overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4 text-center'>
          <Dialog.Panel className='relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-lg'>
            <div className='absolute right-0 top-0 pr-4 pt-4'>
              <button
                type='button'
                className='text-gray-400 hover:text-gray-500 focus:outline-none'
                onClick={() => onClose(false)}
              >
                <span className='sr-only'>Close</span>
                <XIcon className='h-8 w-8' aria-hidden='true' />
              </button>
            </div>
            <div>
              <Dialog.Title
                as='h3'
                className='font-semibold leading-6 text-lg text-center'
              >
                {title}
              </Dialog.Title>
              <div className='mt-2'>
                <Form onSubmit={handleSubmit} className='space-y-4'>
                  <Input
                    ref={inputRef}
                    required
                    type='text'
                    name='tenantId'
                    label='Tenant ID'
                  />
                  <Input
                    required
                    type='password'
                    name='apiSecret'
                    label='API Secret'
                  />
                  <div className='flex justify-end py-3'>
                    <Button type='submit' aria-label='submit'>
                      Save
                    </Button>
                  </div>
                </Form>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  )
}
