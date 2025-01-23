import { Dialog, Transition } from '@headlessui/react'
import { useNavigate } from '@remix-run/react'
import { Button } from './ui'
import { Fragment } from 'react/jsx-runtime'
import { forwardRef, useImperativeHandle, useState } from 'react'

export type RedirectDialogRef = {
  display: () => void
}

type RedirectDialogProps = {
  title: string
  message: string
  redirectPath: string
  redirectButtonText: string
  closeButtonText?: string
}

export const RedirectDialog = forwardRef<
  RedirectDialogRef,
  RedirectDialogProps
>(
  (
    { title, message, redirectPath, redirectButtonText, closeButtonText },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const navigate = useNavigate()
    const onClose = () => setIsOpen(false)

    const onRedirect = () => {
      setIsOpen(false)
      navigate(redirectPath)
    }

    const display = (): void => {
      setIsOpen(true)
    }

    useImperativeHandle(ref, () => ({ display }))

    return (
      <Transition show={isOpen} as={Fragment}>
        <Dialog
          as='div'
          className='relative z-10'
          onClose={() => null}
          open={isOpen}
        >
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-tealish/30 bg-opacity-75 transition-opacity' />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 z-10 overflow-y-auto'>
              <div className='flex min-h-full items-center justify-center p-4 text-center'>
                <Dialog.Panel className='relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-lg'>
                  <Dialog.Title
                    as='h3'
                    className='font-semibold leading-6 text-lg text-center mb-2'
                  >
                    {title}
                  </Dialog.Title>
                  <Dialog.Description className='m-6 mx-4 text-center'>
                    {message}
                  </Dialog.Description>
                  <div className='flex justify-end space-x-4'>
                    <Button
                      className='mr-1'
                      aria-label={redirectButtonText}
                      onClick={onRedirect}
                    >
                      {redirectButtonText}
                    </Button>
                    <Button
                      className='bg-black/50'
                      aria-label={closeButtonText ?? 'Close'}
                      onClick={onClose}
                    >
                      {closeButtonText ?? 'Close'}
                    </Button>
                  </div>
                </Dialog.Panel>
              </div>
            </div>
          </Transition.Child>
        </Dialog>
      </Transition>
    )
  }
)
RedirectDialog.displayName = 'RedirectDialog'
