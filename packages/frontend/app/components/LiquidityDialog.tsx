import type { ChangeEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, Flex, Text, TextField } from '@radix-ui/themes'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { renderFieldError } from '~/lib/form-errors'
import { parseAmount } from '~/shared/utils'

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
  const [displayAmount, setDisplayAmount] = useState<string>('')
  const [actualAmount, setActualAmount] = useState<string>('0')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isConfirming, setIsConfirming] = useState<boolean>(false)
  const amountId = useId()

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value
    const result = parseAmount(userInput, asset.scale)
    if ('error' in result) {
      setErrorMessage(result.error)
      setActualAmount('0')
    } else {
      setErrorMessage('')
      setActualAmount(result.amount.toString())
    }
    setDisplayAmount(userInput)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  if (isConfirming) {
    return (
      <LiquidityConfirmDialog
        title={title}
        onClose={onClose}
        type={type}
        displayAmount={`${displayAmount} ${asset.code}`}
        amount={String(actualAmount)}
        onBack={() => setIsConfirming(false)}
      />
    )
  }

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
              <Text
                size='2'
                weight='medium'
                className='tracking-wide text-gray-700 min-w-[70px]'
              >
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
                value={displayAmount}
                onChange={handleChange}
                step='any'
                size='3'
                className='flex-1'
              />
            </Flex>
            {renderFieldError(errorMessage)}
          </Flex>

          <Flex justify='end' gap='3' mt='2'>
            <Dialog.Close>
              <Button variant='soft' color='gray' type='button'>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              aria-label={`review ${type.toLowerCase()} liquidity`}
              type='button'
              disabled={!!errorMessage || actualAmount === '0'}
              onClick={() => setIsConfirming(true)}
            >
              Review
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
