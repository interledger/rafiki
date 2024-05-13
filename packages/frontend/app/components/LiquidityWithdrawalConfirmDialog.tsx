import { useState } from 'react'
import { Form } from '@remix-run/react'
import { Button, Input } from '~/components/ui'
import { LiquidityBaseDialog } from '~/components/LiquidityBaseDialog'
import type { ZodFieldErrors } from '~/shared/types'
import { type withdrawLiquidityConfirmationSchema } from '~/lib/validate.server'

type ErrorResponse = {
  fieldErrors: ZodFieldErrors<typeof withdrawLiquidityConfirmationSchema>
}

type LiquidityConfirmDialogProps = {
  title: string
  onClose: () => void
  displayAmount: string
  errors?: ErrorResponse
}

export const LiquidityWithdrawalConfirmDialog = ({
  title,
  onClose,
  displayAmount,
  errors
}: LiquidityConfirmDialogProps) => {
  const [timeoutEnabled, setTimeoutEnabled] = useState(false)

  return (
    <LiquidityBaseDialog title={title} onClose={onClose}>
      <p className='m-6 text-center'>
        How would you like to withdraw {displayAmount}?
      </p>
      <Form method='post' replace preventScrollReset className='space-y-4'>
        <label className='flex items-center space-x-2'>
          <input
            type='radio'
            name='transferType'
            value='single'
            className='text-[#F37F64] form-radio focus:border-[#F37F64] focus:ring-[#F37F64]'
            checked={!timeoutEnabled}
            onChange={() => setTimeoutEnabled(false)}
          />
          <span className='text-sm text-gray-700'>Single-Phase Transfer</span>
        </label>
        <label className='flex items-center space-x-2'>
          <input
            type='radio'
            name='transferType'
            value='two-phase'
            className='text-[#F37F64] form-radio focus:border-[#F37F64] focus:ring-[#F37F64]'
            checked={timeoutEnabled}
            onChange={() => setTimeoutEnabled(true)}
          />
          <span className='text-sm text-gray-700'>Two-Phase Transfer</span>
        </label>
        {errors?.fieldErrors.transferType && (
          <p className='text-vermillion font-medium'>
            {errors.fieldErrors.transferType}
          </p>
        )}
        {timeoutEnabled && (
          <Input
            required
            min={1}
            defaultValue={60}
            type='number'
            name='timeout'
            label='Timeout (seconds)'
            error={errors?.fieldErrors.timeout}
          />
        )}
        <div className='flex justify-end space-x-4'>
          <Button
            className='mr-1'
            aria-label={`Withdraw liquidity`}
            type='submit'
          >
            Withdraw
          </Button>
          <Button
            aria-label={`cancel withdraw liquidity`}
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
