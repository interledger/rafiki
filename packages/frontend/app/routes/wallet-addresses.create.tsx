import React, { useState } from 'react'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { PageHeader } from '~/components'
import type { SelectOption } from '~/components/ui'
import { Button, ErrorPanel, Input, Select } from '~/components/ui'
import { loadAssets } from '~/lib/api/asset.server'
import { createWalletAddress } from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createWalletAddressSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import {
  getOpenPaymentsUrl,
  removeTrailingAndLeadingSlash
} from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import type { listTenants } from '~/lib/api/tenant.server'
import { whoAmI, loadTenants, getTenantInfo } from '~/lib/api/tenant.server'

const WALLET_ADDRESS_URL_KEY = 'WALLET_ADDRESS_URL'

const findWASetting = (
  tenantSettings: Awaited<ReturnType<typeof getTenantInfo>>['settings']
) => {
  return tenantSettings.find(
    (setting) => setting.key === WALLET_ADDRESS_URL_KEY
  )?.value
}

const findTenant = (
  tenants: Awaited<ReturnType<typeof listTenants>>['edges'],
  tenantId: string
) => {
  return tenants.find((tenant) => tenant.node.id === tenantId)
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const assets = await loadAssets(request)
  const { id, isOperator } = await whoAmI(request)
  let tenants
  let tenantWAPrefix
  if (isOperator) {
    const loadedTenants = await loadTenants(request)
    tenants = loadedTenants.filter(
      (tenant) => findWASetting(tenant.node.settings) || tenant.node.id === id
    )
  } else {
    const tenant = await getTenantInfo(request, { id })
    const waPrefixSetting = findWASetting(tenant.settings)
    tenantWAPrefix = waPrefixSetting ?? getOpenPaymentsUrl()
  }
  return json({ assets, tenants, tenantWAPrefix })
}

export default function CreateWalletAddressPage() {
  const { assets, tenants, tenantWAPrefix } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'
  const [tenantId, setTenantId] = useState<SelectOption | undefined>()

  const getAssetsOfTenant = (): SelectOption[] => {
    const assetsOfTenant = assets.filter(
      (asset) => asset.node.tenantId === tenantId?.value
    )
    return assetsOfTenant.map((asset) => ({
      value: asset.node.id,
      label: `${asset.node.code} (Scale: ${asset.node.scale})`
    }))
  }

  const currentTenant =
    tenants && tenantId ? findTenant(tenants, tenantId.value) : null
  const waPrefix = currentTenant
    ? findWASetting(currentTenant.node.settings)
    : tenantWAPrefix

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Wallet Address</h3>
          <Button
            aria-label='go back to wallet addresses page'
            to='/wallet-addresses'
          >
            Go back to wallet addresses page
          </Button>
        </PageHeader>
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>
          <fieldset disabled={isSubmitting}>
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='waPrefix'
                    value={waPrefix ?? getOpenPaymentsUrl()}
                    type={'hidden'}
                  />
                  <Input
                    required
                    addOn={waPrefix ?? getOpenPaymentsUrl()}
                    name='name'
                    label='Wallet address name'
                    placeholder='jdoe'
                    error={response?.errors?.fieldErrors.name}
                  />
                  <Input
                    name='publicName'
                    label='Public name'
                    placeholder='Public name'
                    error={response?.errors?.fieldErrors.publicName}
                  />
                  {tenants ? (
                    <Select
                      options={tenants.map((tenant) => ({
                        value: tenant.node.id,
                        label: `${tenant.node.id} ${tenant.node.publicName ? `(${tenant.node.publicName})` : ''}`
                      }))}
                      name='tenantId'
                      placeholder='Select tenant...'
                      label='Tenant'
                      required
                      onChange={(value) => setTenantId(value)}
                      bringForward
                    />
                  ) : (
                    <Select
                      options={assets.map((asset) => ({
                        value: asset.node.id,
                        label: `${asset.node.code} (Scale: ${asset.node.scale})`
                      }))}
                      error={response?.errors.fieldErrors.asset}
                      name='asset'
                      placeholder='Select asset...'
                      label='Asset'
                      required
                    />
                  )}
                  {tenants && tenantId && (
                    <Select
                      options={getAssetsOfTenant()}
                      error={response?.errors.fieldErrors.asset}
                      name='asset'
                      placeholder='Select asset...'
                      label='Asset'
                      required
                    />
                  )}
                </div>
              </div>
            </div>
            <div className='flex justify-end py-3'>
              <Button aria-label='create wallet address' type='submit'>
                {isSubmitting ? 'Creating wallet address ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createWalletAddressSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = createWalletAddressSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const baseUrl = removeTrailingAndLeadingSlash(result.data.waPrefix)
  const path = removeTrailingAndLeadingSlash(result.data.name)

  const response = await createWalletAddress(request, {
    address: `${baseUrl}/${path}`,
    publicName: result.data.publicName,
    assetId: result.data.asset,
    tenantId: result.data.tenantId,
    additionalProperties: []
  })

  if (!response?.walletAddress) {
    errors.message = ['Could not create wallet address. Please try again!']
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Wallet address was created.',
      type: 'success'
    },
    location: `/wallet-addresses/${response.walletAddress?.id}`
  })
}
