import { Form } from '@remix-run/react'
import { Button, Dialog, Flex, Text } from '@radix-ui/themes'

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
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content style={{ maxWidth: 500 }}>
        <Dialog.Title>
          <Text size='5' weight='bold'>
            {title}
          </Text>
        </Dialog.Title>

        <Dialog.Description size='2' mt='4' mb='4'>
          Are you sure you want to {type.toLowerCase()} {displayAmount}?
        </Dialog.Description>

        <Form method='post' replace preventScrollReset>
          <Flex justify='end' gap='3' mt='2'>
            <Dialog.Close>
              <Button
                variant='soft'
                color='gray'
                type='button'
                aria-label={`cancel ${type.toLowerCase()} liquidity`}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button aria-label={`${type.toLowerCase()} liquidity`} type='submit'>
              {type}
            </Button>
          </Flex>
        </Form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
