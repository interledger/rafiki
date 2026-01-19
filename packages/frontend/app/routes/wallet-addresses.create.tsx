import type { ReactNode } from 'react'
import { useState } from 'react'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Select, Text, TextField } from '@radix-ui/themes'
import { renderErrorPanel, renderFieldError } from '~/lib/form-errors'
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

type SelectOption = {
  label: string
  value: string
}

type FormFieldProps = {
  name: string
  label: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'
  error?: string | string[]
  required?: boolean
  description?: ReactNode
}

const FormField = ({
  name,
  label,
  placeholder,
  type = 'text',
  error,
  required,
  description
}: FormFieldProps) => (
  <Flex direction='column' gap='2'>
    <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
      <label htmlFor={name}>
        {label}
        {required ? <span className='text-vermillion'> *</span> : null}
      </label>
    </Text>
    {description ? (
      <Text size='2' color='gray'>
        {description}
      </Text>
    ) : null}
    <TextField.Root
      id={name}
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
      size='3'
      className='w-full'
    />
    {renderFieldError(error)}
  </Flex>
)

const PlainInputField = ({
  name,
  label,
  placeholder,
  error,
  required,
  description,
  addOn
}: FormFieldProps & { addOn?: ReactNode }) => (
  <Flex direction='column' gap='2'>
    <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
      <label htmlFor={name}>
        {label}
        {required ? <span className='text-vermillion'> *</span> : null}
      </label>
    </Text>
    {description ? (
      <Text size='2' color='gray'>
        {description}
      </Text>
    ) : null}
    <div className='shadow-sm flex relative rounded-md'>
      {addOn ? (
        <span
          className='inline-flex shrink-0 items-center rounded-l-md border border-r-0 px-3 text-xs lg:text-base'
          style={{
            borderColor: 'var(--gray-a7)',
            backgroundColor: 'var(--gray-a2)'
          }}
        >
          {addOn}
        </span>
      ) : null}
      <input
        id={name}
        name={name}
        type='text'
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        className={`block w-full rounded-md border transition-colors duration-150 placeholder:font-extralight placeholder:text-gray-500 placeholder:opacity-80 focus:outline-none focus:ring-0 disabled:bg-mercury ${
          addOn ? 'rounded-l-none' : ''
        }`}
        style={{ borderColor: 'var(--gray-a7)' }}
      />
    </div>
    {renderFieldError(error)}
  </Flex>
)

type SelectFieldProps = {
  label: string
  name: string
  options: SelectOption[]
  placeholder: string
  required?: boolean
  error?: string | string[]
  description?: ReactNode
  defaultValue?: SelectOption
  onChange?: (value?: SelectOption) => void
  bringForward?: boolean
}

const SelectField = ({
  label,
  name,
  options,
  placeholder,
  required,
  error,
  description,
  defaultValue,
  onChange,
  bringForward
}: SelectFieldProps) => {
  const [selectedValue, setSelectedValue] = useState(
    defaultValue?.value ?? ''
  )

  return (
    <Flex direction='column' gap='2'>
      <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
        <label htmlFor={`${name}-select`}>
          {label}
          {required ? <span className='text-vermillion'> *</span> : null}
        </label>
      </Text>
      {description ? (
        <Text size='2' color='gray'>
          {description}
        </Text>
      ) : null}
      <input type='hidden' name={name} value={selectedValue} />
      <div className={`relative ${bringForward ? 'forward' : ''}`}>
        <Select.Root
          defaultValue={defaultValue?.value}
          onValueChange={(value) => {
            setSelectedValue(value)
            onChange?.(options.find((option) => option.value === value))
          }}
        >
          <Select.Trigger
            id={`${name}-select`}
            placeholder={placeholder}
            className='w-full'
          />
          <Select.Content>
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
    {renderFieldError(error)}
    </Flex>
  )
}

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
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Create Wallet Address</Heading>

        {renderErrorPanel(response?.errors.message)}

        <Card className='max-w-3xl'>
          <Form method='post' replace>
            <fieldset disabled={isSubmitting}>
              <Flex direction='column' gap='5'>
                <Box>
                  <Flex direction='column' gap='5'>
                    <Flex direction='column' gap='4'>
                      <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                        General Information
                      </Text>
                      <input
                        name='waPrefix'
                        value={waPrefix ?? getOpenPaymentsUrl()}
                        type='hidden'
                        readOnly
                      />
                      <PlainInputField
                        name='name'
                        label='Wallet address name'
                        placeholder='jdoe'
                        error={response?.errors?.fieldErrors.name}
                        required
                        addOn={waPrefix ?? getOpenPaymentsUrl()}
                      />
                      <FormField
                        name='publicName'
                        label='Public name'
                        placeholder='Public name'
                        error={response?.errors?.fieldErrors.publicName}
                      />
                      {tenants ? (
                        <SelectField
                          options={tenants.map((tenant) => ({
                            value: tenant.node.id,
                            label: `${tenant.node.id} ${
                              tenant.node.publicName
                                ? `(${tenant.node.publicName})`
                                : ''
                            }`
                          }))}
                          name='tenantId'
                          placeholder='Select tenant...'
                          label='Tenant'
                          required
                          onChange={(value) => setTenantId(value)}
                          bringForward
                          error={response?.errors?.fieldErrors.tenantId}
                        />
                      ) : (
                        <SelectField
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
                        <SelectField
                          options={getAssetsOfTenant()}
                          error={response?.errors.fieldErrors.asset}
                          name='asset'
                          placeholder='Select asset...'
                          label='Asset'
                          required
                        />
                      )}
                    </Flex>
                  </Flex>
                </Box>

                <Flex justify='end'>
                  <Button aria-label='create wallet address' type='submit'>
                    {isSubmitting ? 'Creating wallet address ...' : 'Create'}
                  </Button>
                </Flex>
              </Flex>
            </fieldset>
          </Form>
        </Card>
      </Flex>
    </Box>
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
