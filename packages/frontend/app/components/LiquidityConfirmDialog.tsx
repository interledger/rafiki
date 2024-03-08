import { Dialog } from '@headlessui/react'
import { Form } from '@remix-run/react'
import { XIcon } from '~/components/icons'
import { Button } from '~/components/ui'

type LiquidityConfirmDialogProps = {
  title: string
  onClose: () => void
  type: 'Deposit' | 'Withdraw'
  displayAmount: string
}

export const LiquidityConfirmDialog = ({
  title,
  onClose,
  type,
  displayAmount
}: LiquidityConfirmDialogProps) => {
  return (
    <Dialog as='div' className='relative z-10' onClose={onClose} open={true}>
      <div className='fixed inset-0 bg-tealish/30 bg-opacity-75 transition-opacity' />
      <div className='fixed inset-0 z-10 overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4 text-center'>
          <Dialog.Panel className='relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-lg'>
            <div className='absolute right-0 top-0 pr-4 pt-4'>
              <button
                type='button'
                className='text-gray-400 hover:text-gray-500 focus:outline-none'
                onClick={onClose}
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
                <p className='m-6 text-center'>
                  Are you sure you want to {type.toLowerCase()} {displayAmount}?
                </p>
                <Form method='post' replace preventScrollReset>
                  {/* no input needed - form submit is confirmation */}
                  <div className='flex justify-end space-x-4'>
                    <Button
                      className='mr-1'
                      aria-label={`${type} liquidity`}
                      type='submit'
                    >
                      {type}
                    </Button>
                    <Button
                      aria-label={`cancel ${type} liquidity`}
                      type='reset'
                      onClick={onClose}
                    >
                      Cancel
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
