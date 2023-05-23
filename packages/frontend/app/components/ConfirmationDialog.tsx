import { Dialog, Transition } from '@headlessui/react'
import {
  forwardRef,
  Fragment,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { ExclamationTriangle, XIcon } from './icons'
import { Button, Input } from './ui'

export type ConfirmationDialogRef = {
  display: () => void
}

type ConfirmationDialogProps = {
  title: string
  keyword: string
  message?: string
  confirmButtonText: string
  onConfirm: () => void
  onCancel?: () => void
}

export const ConfirmationDialog = forwardRef<
  ConfirmationDialogRef,
  ConfirmationDialogProps
>(
  (
    { onConfirm, onCancel, title, message, keyword, confirmButtonText },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [confirmationPrompt, setConfirmationPrompt] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)

    const display = (): void => {
      setIsOpen(true)
    }

    const isCorrectPrompt = (): boolean => confirmationPrompt === keyword

    const confirmHandler = (): void => {
      if (isCorrectPrompt()) {
        setIsOpen(false)
        setConfirmationPrompt('')
        if (onConfirm) {
          onConfirm()
        }
      }
    }

    const cancelHandler = (): void => {
      setIsOpen(false)
      setConfirmationPrompt('')
      if (onCancel) {
        onCancel()
      }
    }

    useImperativeHandle(ref, () => ({ display }))

    return (
      <>
        <Transition.Root show={isOpen} as={Fragment}>
          <Dialog
            as='div'
            className='relative z-10'
            initialFocus={inputRef}
            onClose={() => cancelHandler()}
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

            <div className='fixed inset-0 z-10 overflow-y-auto'>
              <div className='flex min-h-full items-center justify-center p-4 text-center'>
                <Transition.Child
                  as={Fragment}
                  enter='ease-out duration-300'
                  enterFrom='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
                  enterTo='opacity-100 translate-y-0 sm:scale-100'
                  leave='ease-in duration-200'
                  leaveFrom='opacity-100 translate-y-0 sm:scale-100'
                  leaveTo='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
                >
                  <Dialog.Panel className='relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-lg'>
                    <div className='absolute right-0 top-0 pr-4 pt-4'>
                      <button
                        type='button'
                        className='text-gray-400 hover:text-gray-500 focus:outline-none'
                        onClick={() => cancelHandler()}
                      >
                        <span className='sr-only'>Close</span>
                        <XIcon className='h-8 w-8' aria-hidden='true' />
                      </button>
                    </div>
                    <div>
                      <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100'>
                        <ExclamationTriangle
                          className='text-red-500 h-5 w-5'
                          aria-hidden='true'
                        />
                      </div>
                      <div className='mt-3 text-center'>
                        <Dialog.Title
                          as='h3'
                          className='font-semibold leading-6 text-lg'
                        >
                          {title}
                        </Dialog.Title>
                        <div className='mt-2'>
                          <p>
                            {message
                              ? message
                              : `Please note that this action is not reversible.`}
                          </p>
                          <p className='font-medium mt-4'>
                            To confirm, type &quot;
                            <span className='font-bold'>{keyword}</span>
                            &quot; below:
                          </p>
                          <Input
                            value={confirmationPrompt}
                            ref={inputRef}
                            onChange={(e) =>
                              setConfirmationPrompt(e.currentTarget.value)
                            }
                          />
                        </div>
                        <div className='mt-2'>
                          <Button
                            aria-label={confirmButtonText ?? 'Confirm'}
                            intent='danger'
                            onClick={() => confirmHandler()}
                            className='w-full'
                            disabled={!isCorrectPrompt()}
                          >
                            {confirmButtonText}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition.Root>
      </>
    )
  }
)
ConfirmationDialog.displayName = 'ConfirmationDialog'
