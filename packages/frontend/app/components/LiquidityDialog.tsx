import { Form } from '@remix-run/react'
import type { ChangeEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, Flex, Text, TextField } from '@radix-ui/themes'
import { FieldError } from '~/components/ui'

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
  const amountId = useId()

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
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content style={{ maxWidth: 500 }}>
        <Dialog.Title>
          <Text size='5' weight='bold'>
            {title}
          </Text>
        </Dialog.Title>

        <Flex direction='column' gap='4' mt='4'>
          <Flex direction='column' gap='2'>
            <Flex align='center' gap='2'>
              <Text size='2' weight='medium' className='tracking-wide text-gray-700 min-w-[70px]'>
                Amount
              </Text>
              <Text size='2' weight='medium' className='min-w-[50px]'>
                {asset.code}
              </Text>
              <TextField.Root
                id={amountId}
                ref={inputRef}
                required
                type='number'
                name='displayAmount'
                onChange={handleChange}
                step='any'
                size='3'
                className='flex-1'
              />
            </Flex>
            <FieldError error={errorMessage} />
          </Flex>

          <Form method='post' replace preventScrollReset>
            <input
              required
              min={1}
              type='hidden'
              name='amount'
              value={actualAmount}
            />
            <Flex justify='end' gap='3' mt='2'>
              <Dialog.Close>
                <Button variant='soft' color='gray' type='button'>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                aria-label={`${type} liquidity`}
                type='submit'
                disabled={!!errorMessage}
              >
                {type} liquidity
              </Button>
            </Flex>
          </Form>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
