import { Dialog } from '@headlessui/react'
import { Form } from '@remix-run/react'
import { useState } from 'react'
import { XIcon } from '~/components/icons'
import { Button, Input } from '~/components/ui'

type BasicAsset = {
  code: string
  scale: number
}

type LiquidityDialogProps = {
  title: string
  onClose: () => void
  type: 'Deposit' | 'Withdraw'
  asset: BasicAsset
}

export const LiquidityDialog = ({
  title,
  onClose,
  type,
  asset
}: LiquidityDialogProps) => {
  const [amount, setAmount] = useState<number>(0)

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
                <Form method='post' replace preventScrollReset>
                  <Input
                    required
                    min={1}
                    type='number'
                    name='amount'
                    label='Amount'
                    onChange={e => setAmount(Number(e.target.value))}
                  />
                  <div className='text-gray-500 text-sm mt-2'>
                    <p>Based on the asset:</p>
                    <p>Amount {amount} = {amount / Math.pow(10, asset.scale)} {asset.code} </p>
                  </div>
                  <div className='flex justify-end py-3'>
                    <Button aria-label={`${type} liquidity`} type='submit'>
                      {type} liquidity
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
