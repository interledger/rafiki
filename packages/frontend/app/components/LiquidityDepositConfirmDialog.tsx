import { Form } from '@remix-run/react'
import { Button } from '~/components/ui'
import { LiquidityBaseDialog } from '~/components/LiquidityBaseDialog'

type LiquidityConfirmDialogProps = {
  title: string
  onClose: () => void
  displayAmount: string
}

export const LiquidityDepositConfirmDialog = ({
  title,
  onClose,
  displayAmount
}: LiquidityConfirmDialogProps) => {
  return (
    <LiquidityBaseDialog title={title} onClose={onClose}>
      <p className='m-6 text-center'>
        Are you sure you want to deposit {displayAmount}?
      </p>
      <Form method='post' replace preventScrollReset>
        {/* no input needed - form submit is confirmation */}
        <div className='flex justify-end space-x-4'>
          <Button
            className='mr-1'
            aria-label={`Deposit liquidity`}
            type='submit'
          >
            Deposit
          </Button>
          <Button
            aria-label={`cancel deposit liquidity`}
            type='reset'
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </Form>
    </LiquidityBaseDialog>
  )
}
