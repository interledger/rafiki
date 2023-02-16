import { Transition } from '@headlessui/react'
import { cx } from 'class-variance-authority'
import type { Dispatch, FC, SetStateAction } from 'react'
import { Fragment, useEffect } from 'react'
import { type Message } from '~/lib/message.server'
import { CheckCircle } from './icons/CheckCircle'

interface SnackbarProps {
  id: string
  show?: boolean
  // The label value.
  message: Message | null
  action?: string
  icon?: string
  onClose(): void
  // Offset to the right for the WalletLayout on desktop
  offset?: boolean
  // ms delay after which the snackbar should be aut dismissed.
  dismissAfter?: number
}

export const Snackbar: FC<SnackbarProps> = ({
  id,
  message,
  onClose,
  offset,
  show = false,
  dismissAfter
}) => {
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (dismissAfter && show) {
      timer = setTimeout(() => {
        onClose()
      }, dismissAfter)
    }
    return () => clearTimeout(timer)
  }, [dismissAfter, onClose, show])

  if (!message) return null

  return (
    <Transition
      id={id}
      appear
      show={show}
      as={'div'}
      className={cx(
        'fixed top-2 left-0 z-[100] mx-auto w-full overflow-y-visible lg:top-4',
        offset ? 'lg:pl-64' : ''
      )}
    >
      <div className='flex justify-center text-center'>
        <Transition.Child
          as={Fragment}
          enter='ease-out duration-300'
          enterFrom='opacity-0 scale-95'
          enterTo='opacity-100 scale-100'
          leave='ease-in duration-200'
          leaveFrom='opacity-100 scale-100'
          leaveTo='opacity-0 scale-95'
        >
          <div className='mx-4 flex w-full transform items-center justify-start space-x-3 overflow-hidden rounded-xl bg-white py-3 px-4 text-left align-middle shadow-lg transition-all sm:max-w-[22rem]'>
            {message.type === 'success' && (
              <CheckCircle className='w-4 h-4 text-green-400' />
            )}
            <p className='text text-tealish'>{message.content}</p>
          </div>
        </Transition.Child>
      </div>
    </Transition>
  )
}
