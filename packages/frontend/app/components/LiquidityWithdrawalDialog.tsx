import { useState } from 'react'
import { Form } from '@remix-run/react'
import { Button, Input } from '~/components/ui'
import { LiquidityBaseDialog } from '~/components/LiquidityBaseDialog'
import type { ZodFieldErrors } from '~/shared/types'
import { type withdrawLiquiditySchema } from '~/lib/validate.server'

type ErrorResponse = {
  fieldErrors: ZodFieldErrors<typeof withdrawLiquiditySchema>
}

type LiquidityDialogProps = {
  title: string
  onClose: () => void
  errors?: ErrorResponse
}

export const LiquidityWithdrawalDialog = ({
  title,
  onClose,
  errors
}: LiquidityDialogProps) => {
  const [timeoutEnabled, setTimeoutEnabled] = useState(false)

  return (
    <LiquidityBaseDialog title={title} onClose={onClose}>
      <Form method='post' replace preventScrollReset className='space-y-4'>
        <Input
          required
          min={1}
          type='number'
          name='amount'
          label='Amount'
          error={errors?.fieldErrors.amount}
        />
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
        <div className='flex justify-end py-3'>
          <Button aria-label={`Withdraw liquidity`} type='submit'>
            Withdraw liquidity
          </Button>
        </div>
      </Form>
    </LiquidityBaseDialog>
  )
}
