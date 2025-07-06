import {
  ActionFunctionArgs,
  json,
  type LoaderFunctionArgs
} from '@remix-run/node'
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
  useLocation
} from '@remix-run/react'
import { ChangeEvent, useEffect, useState } from 'react'
import {
  PageHeader,
  Table,
  Button,
  ErrorPanel,
  Input,
  Select
} from '../components'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { getAccountTransactions } from '../lib/transactions.server'
import { loadAssets } from '~/lib/asset.server'
import { updateAccountSchema, addLiquiditySchema } from '~/lib/validate.server'
import { getOpenPaymentsUrl, getTenantCredentials } from '~/lib/utils'
import { ZodFieldErrors } from '~/lib/types'
import {
  getAccountWithBalance,
  updateAccount,
  addLiquidity
} from '~/lib/accounts.server'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { accountId } = params

  if (!accountId) {
    throw json(null, { status: 400, statusText: 'Account not provided.' })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const options = await getTenantCredentials(session)
  const account = await getAccountWithBalance(accountId)
  if (!account?.id) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Account not found',
        type: 'error'
      },
      location: '/'
    })
  }

  const transactions = await getAccountTransactions(accountId)
  const assets = await loadAssets(options)

  return json({
    account,
    assets,
    transactions
  })
}

export default function EditAccount() {
  const { account, assets, transactions } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const { key } = useLocation()

  const [liquidityModalOpen, setLiquidityModalOpen] = useState(false)
  const [amountToAdd, setAmountToAdd] = useState(0)

  const isSubmitting = state === 'submitting'

  const onAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAmountToAdd(Number(e?.target?.value || 0))
  }

  useEffect(() => {
    setAmountToAdd(0)
    setLiquidityModalOpen(false)
  }, [key])

  return (
    <>
      <div className='pt-4 flex flex-col space-y-8'>
        <div className='flex flex-col rounded-md bg-white px-6'>
          <PageHeader>
            <h3 className='text-xl'>Account</h3>
            <Button aria-label='go back to accounts page' to='/'>
              Go to accounts page
            </Button>
          </PageHeader>
          {/* Update Account form */}
          <Form method='post' replace>
            <div className='px-6 pt-5'>
              <ErrorPanel errors={response?.errors.general.message} />
            </div>

            <fieldset disabled={isSubmitting}>
              <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
                <div className='col-span-1 pt-3'>
                  <h3 className='text-lg font-medium'>General Information</h3>
                </div>
                <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                  <div className='w-full p-4 space-y-3'>
                    <input type='hidden' name='id' value={account.id} />
                    <Input
                      name='name'
                      label='Account name'
                      placeholder='Account name'
                      defaultValue={account?.name}
                      error={response?.errors.general.fieldErrors.name}
                    />
                    <Input
                      disabled
                      name='path'
                      label='Wallet address'
                      placeholder='jdoe'
                      value={`${getOpenPaymentsUrl()}/${account?.path}`}
                    />
                    <Select
                      options={assets.map(
                        (asset: {
                          node: { id: string; code: string; scale: number }
                        }) => ({
                          value: asset.node.id,
                          label: `${asset.node.code} (Scale: ${asset.node.scale})`
                        })
                      )}
                      name='assetId'
                      placeholder='Select asset...'
                      label='Asset'
                      selectedValue={account?.assetId}
                      disabled
                    />
                  </div>
                  <div className='flex justify-end py-3 px-4'>
                    <Button
                      aria-label='update account'
                      name='intent'
                      value='general'
                      type='submit'
                    >
                      {isSubmitting ? 'Updating account ...' : 'Update'}
                    </Button>
                  </div>
                </div>
              </div>
            </fieldset>
          </Form>
          {/* Update Account form - END */}
          <fieldset key={`liquidity_${key}`} disabled={isSubmitting}>
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Balance</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <p className='font-medium'>Available</p>
                  <p className='mt-1'>{`${(
                    Number(account.balance) / 100
                  ).toFixed(account.assetScale)} ${account.assetCode}`}</p>
                </div>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    type='number'
                    name='balance'
                    label='Amount to add'
                    placeholder='0'
                    min={1}
                    error={response?.errors.addLiquidity.fieldErrors.amount}
                    onChange={onAmountChange}
                  />
                  <div className='flex justify-end'>
                    <Button
                      aria-label='add liquidity'
                      type='button'
                      disabled={amountToAdd <= 0}
                      onClick={() => setLiquidityModalOpen(true)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>
          {/* Transsactions */}
          <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
            <div className='col-span-1 pt-3'>
              <h3 className='text-lg font-medium'>Transactions</h3>
            </div>
            <div className='md:col-span-2 bg-white rounded-md shadow-md'>
              <div className='w-full p-4 space-y-3'>
                <Table>
                  <Table.Head
                    columns={['Date', 'Type', 'Metadata', 'Amount']}
                  />

                  {transactions.map((trx) => (
                    <Table.Row key={trx.id}>
                      <Table.Cell>{trx.createdAt}</Table.Cell>
                      <Table.Cell>{trx.type}</Table.Cell>
                      <Table.Cell>
                        <code>{JSON.stringify(trx.metadata)}</code>
                      </Table.Cell>
                      <Table.Cell>
                        {(Number(trx.amountValue) / 100).toFixed(
                          trx.assetScale
                        )}{' '}
                        {trx.assetCode}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table>
                <div className='flex items-center justify-between p-5'>
                  &nbsp;
                </div>
              </div>
            </div>
          </div>
          {/* Transsactions - END */}
        </div>
      </div>
      <LiquidityConfirmDialog
        title='Confirm adding liquidity'
        isOpen={liquidityModalOpen}
        onClose={() => setLiquidityModalOpen(false)}
        account={account}
        displayAmount={amountToAdd.toString()}
      />
    </>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const actionResponse: {
    errors: {
      general: {
        fieldErrors: ZodFieldErrors<typeof updateAccountSchema>
        message: string[]
      }
      addLiquidity: {
        fieldErrors: ZodFieldErrors<typeof addLiquiditySchema>
        message: string[]
      }
    }
  } = {
    errors: {
      general: {
        fieldErrors: {},
        message: []
      },
      addLiquidity: {
        fieldErrors: {},
        message: []
      }
    }
  }

  const formData = await request.formData()
  const intent = formData.get('intent')
  formData.delete('intent')

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  switch (intent) {
    case 'general': {
      const result = updateAccountSchema.safeParse(Object.fromEntries(formData))

      if (!result.success) {
        actionResponse.errors.general.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const accountId = await updateAccount({
        ...result.data
      })

      if (!accountId) {
        actionResponse.errors.general.message = [
          'Could not update account. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      return setMessageAndRedirect({
        session,
        message: {
          content: 'Account updated.',
          type: 'success'
        },
        location: `/accounts/${accountId}`
      })
    }
    case 'add-liquidity': {
      const result = addLiquiditySchema.safeParse(Object.fromEntries(formData))

      if (!result.success) {
        actionResponse.errors.addLiquidity.fieldErrors =
          result.error.flatten().fieldErrors
        return json({ ...actionResponse }, { status: 400 })
      }

      const accountId = await addLiquidity({
        ...result.data
      })

      if (!accountId) {
        actionResponse.errors.general.message = [
          'Could not add liquidity. Please try again!'
        ]
        return json({ ...actionResponse }, { status: 400 })
      }

      return setMessageAndRedirect({
        session,
        message: {
          content: 'Liquidity added.',
          type: 'success'
        },
        location: `/accounts/${accountId}`
      })
    }
  }
}
