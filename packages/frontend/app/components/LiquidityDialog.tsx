import { Dialog } from '@headlessui/react'
import { Form } from '@remix-run/react'
import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
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
  const [actualAmount, setActualAmount] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value
    const scaledInput = parseFloat(userInput) * Math.pow(10, asset.scale)
    const integerScaledInput = Math.floor(scaledInput)
    if (scaledInput < 0) {
      const error = 'The amount should be a positive value'
      setErrorMessage(error)
    } else if (scaledInput !== integerScaledInput) {
      const error = 'The asset scale cannot accomodate this value'
      setErrorMessage(error)
    } else {
      setErrorMessage('')
    }
    setActualAmount(integerScaledInput)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

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
                <Input
                  ref={inputRef}
                  required
                  type='number'
                  name='displayAmount'
                  label='Amount'
                  onChange={handleChange}
                  addOn={asset.code}
                  step='any'
                  error={errorMessage}
                />
                <Form method='post' replace preventScrollReset>
                  <Input
                    required
                    min={1}
                    type='hidden'
                    name='amount'
                    value={actualAmount}
                  />
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
