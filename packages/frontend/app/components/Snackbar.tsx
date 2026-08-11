import { Transition } from '@headlessui/react'
import { cx } from 'class-variance-authority'
import type { FC } from 'react'
import { Fragment, useEffect, useRef } from 'react'
import { type Message } from '~/lib/message.server'
import { CheckCircleSolid, XIcon, XCircleSolid } from './icons'

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

export const Snackbar: FC<SnackbarProps> = (props) => (
  <>
    <SnackbarAnnouncer message={props.message} show={props.show} />
    <SnackbarToast {...props} />
  </>
)

// Live regions are only reliably announced by screen readers when the browser
// already has the node registered and then content its changes.
const SnackbarAnnouncer: FC<Pick<SnackbarProps, 'message' | 'show'>> = ({
  message,
  show = false
}) => (
  <div
    role={message?.type === 'error' ? 'alert' : 'status'}
    aria-live={message?.type === 'error' ? 'assertive' : 'polite'}
    aria-atomic='true'
    className='sr-only'
  >
    {show ? message?.content : ''}
  </div>
)

const SnackbarToast: FC<SnackbarProps> = ({
  id,
  message,
  onClose,
  offset,
  show = false,
  dismissAfter
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const startTimer = () => {
    if (dismissAfter && show) {
      timerRef.current = setTimeout(onClose, dismissAfter)
    }
  }

  const clearTimer = () => clearTimeout(timerRef.current)

  useEffect(() => {
    startTimer()
    return clearTimer
  }, [dismissAfter, onClose, show])

  if (!message) return null

  return (
    <Transition
      id={id}
      appear
      show={show}
      as={'div'}
      className={cx(
        'fixed top-2 left-0 z-[100] mx-auto w-full overflow-y-visible lg:top-4 select-none',
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
          <div
            onMouseEnter={clearTimer}
            onMouseLeave={startTimer}
            onFocus={clearTimer}
            onBlur={startTimer}
            className={cx(
              'relative mx-4 flex w-full transform items-center justify-between space-x-3 overflow-hidden rounded-xl py-3 px-4 text-left align-middle shadow-lg transition-all sm:max-w-[22rem]',
              message.type === 'success' ? 'bg-green-500' : 'bg-white'
            )}
          >
            <div className='flex items-center space-x-2'>
              {message.type === 'success' && (
                <CheckCircleSolid className='w-4 h-4 text-white flex-shrink-0' />
              )}
              {message.type === 'error' && (
                <XCircleSolid className='w-4 h-4 text-red-400 flex-shrink-0' />
              )}
              {/* hidden here to avoid double narration (announced via SnackbarAnnouncer already) */}
              <p
                aria-hidden='true'
                className={cx(
                  'text',
                  message.type === 'success' ? 'text-white' : 'text-tealish'
                )}
              >
                {message.content}
              </p>
            </div>
            <button
              type='button'
              className={cx(
                '-mr-2',
                message.type === 'success'
                  ? 'text-white hover:text-gray-200'
                  : 'text-gray-500 hover:text-gray-900'
              )}
              onClick={() => onClose()}
            >
              <XIcon className='w-5 h-5' />
              <span className='sr-only'>Close notification</span>
            </button>
          </div>
        </Transition.Child>
      </div>
    </Transition>
  )
}
