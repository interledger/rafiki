import { Form } from '@remix-run/react'
import { Button, Input } from '~/components/ui'
import { LiquidityBaseDialog } from '~/components/LiquidityBaseDialog'

type LiquidityDialogProps = {
  title: string
  onClose: () => void
}

export const LiquidityDepositDialog = ({
  title,
  onClose
}: LiquidityDialogProps) => {
  return (
    <LiquidityBaseDialog title={title} onClose={onClose}>
      <Form method='post' replace preventScrollReset className='space-y-4'>
        <Input required min={1} type='number' name='amount' label='Amount' />
        <div className='flex justify-end py-3'>
          <Button aria-label={`Deposit liquidity`} type='submit'>
            Deposit liquidity
          </Button>
        </div>
      </Form>
    </LiquidityBaseDialog>
  )
}
