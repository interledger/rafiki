import { useState } from 'react'
import { json, type ActionFunctionArgs, redirect } from '@remix-run/node'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, ErrorPanel, Input, PasswordInput } from '~/components/ui'
import { createTenant, whoAmI } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createTenantSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { TenantSettingKey } from '~/generated/graphql'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  const me = await whoAmI(request)
  return json({ me })
}

export default function CreateTenantPage() {
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'
  const { me } = useLoaderData<typeof loader>()
  if (!me || !me.isOperator) throw redirect('tenants')

  const [exchangeRatesUrl, setExchangeRatesUrl] = useState<string>()
  const [webhookUrl, setWebhookUrl] = useState<string>()
  const [webhookTimeout, setWebhookTimeout] = useState<number>()
  const [webhookMaxRetry, setWebhookMaxRetry] = useState<number>()
  const [walletAddressUrl, setWalletAddressUrl] = useState<string>()
  const [ilpAddress, setIlpAddress] = useState<string>()

  const tenantSettings: {
    name: string
    value:
      | ReturnType<typeof useState<string>>[0]
      | ReturnType<typeof useState<number>>[0]
    setValue:
      | ReturnType<typeof useState<string>>[1]
      | ReturnType<typeof useState<number>>[1]
    placeholder: string
    label: string
  }[] = [
    {
      name: 'exchangeRatesUrl',
      placeholder: 'Exhange Rates Url',
      label: 'Exchange Rates Url',
      value: exchangeRatesUrl,
      setValue: setExchangeRatesUrl
    },
    {
      name: 'webhookUrl',
      placeholder: 'Webhook Url',
      label: 'Webhook Url',
      value: webhookUrl,
      setValue: setWebhookUrl
    },
    {
      name: 'webhookTimeout',
      placeholder: 'Webhook Timeout',
      label: 'Webhook Timeout',
      value: webhookTimeout,
      setValue: setWebhookTimeout
    },
    {
      name: 'webhookMaxRetry',
      placeholder: 'Webhook Max Retry',
      label: 'Webhook Max Retry',
      value: webhookMaxRetry,
      setValue: setWebhookMaxRetry
    },
    {
      name: 'walletAddressUrl',
      placeholder: 'Wallet Address Url',
      label: 'Wallet Address Url',
      value: walletAddressUrl,
      setValue: setWalletAddressUrl
    },
    {
      name: 'ilpAddress',
      placeholder: 'ILP Address',
      label: 'ILP Address',
      value: ilpAddress,
      setValue: setIlpAddress
    }
  ]

  let tenantSettingErrors: string[] = []

  if (response) {
    const errorEntries = Object.entries(response.errors.fieldErrors)
    errorEntries.map(([key, value]) => {
      if (tenantSettings.find((setting) => key === setting.name)) {
        tenantSettingErrors = tenantSettingErrors.concat(value)
      }
    })
  }

  const getTenantSettingError = (settingName: string) => {
    const foundError =
      response &&
      Object.entries(response.errors.fieldErrors).find(
        ([key, _]) => key === settingName
      )
    return foundError && foundError[1]
  }

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <h3 className='text-xl'>Create Tenant</h3>
          <Button aria-label='go back to tenants page' to='/tenants'>
            Go to tenants page
          </Button>
        </PageHeader>
        {/* Create Tenant form */}
        <Form method='post' replace>
          <div className='px-6 pt-5'>
            <ErrorPanel errors={response?.errors.message} />
          </div>

          <fieldset disabled={isSubmitting}>
            {/* Tenant General Info */}
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>General Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='publicName'
                    label='Public Name'
                    placeholder='Public name'
                    error={response?.errors?.fieldErrors.publicName}
                  />
                  <Input
                    name='email'
                    label='Email'
                    placeholder='Email'
                    error={response?.errors?.fieldErrors.email}
                  />
                </div>
              </div>
            </div>
            {/* Tenant General Info - END */}
            {/* Tenant Sensitive Info */}
            <div className='grid grid-cols-1 px-0 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Sensitive Information</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <PasswordInput
                    name='apiSecret'
                    label='API Secret'
                    placeholder='The API secret. Treat as sensitive information.'
                    error={response?.errors?.fieldErrors.apiSecret}
                    required
                  />
                </div>
              </div>
            </div>
            {/* Tenant Sensitive Info - END */}
            {/* Tenant Identity Provider */}
            <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>
                  Identity Provider Information
                </h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  <Input
                    name='idpConsentUrl'
                    label='Consent URL'
                    placeholder='Provide the Identity Provider Consent URL'
                    error={response?.errors?.fieldErrors.idpConsentUrl}
                  />
                  <PasswordInput
                    name='idpSecret'
                    label='Secret'
                    placeholder='Provide the Identity Provider Secret'
                    error={response?.errors?.fieldErrors.idpSecret}
                  />
                </div>
              </div>
            </div>
            {/* Tenant Identity Provider - End */}
            {/* Tenant Settings */}
            <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
              <div className='col-span-1 pt-3'>
                <h3 className='text-lg font-medium'>Tenant Settings</h3>
              </div>
              <div className='md:col-span-2 bg-white rounded-md shadow-md'>
                <div className='w-full p-4 space-y-3'>
                  {tenantSettings.map((setting) => (
                    <div key={`div-${setting.name}`}>
                      <Input
                        key={setting.name}
                        name={setting.name}
                        label={setting.label}
                        placeholder={setting.placeholder}
                      />
                      <p
                        id={`${setting.name}-error`}
                        className='text-red-500 text-sa'
                      >
                        {getTenantSettingError(setting.name)}
                      </p>
                    </div>
                  ))}
                </div>
                <ErrorPanel errors={tenantSettingErrors} />
              </div>
            </div>
            {/* Tenant Settings - END */}
            <div className='flex justify-end py-3'>
              <Button aria-label='create tenant' type='submit'>
                {isSubmitting ? 'Creating tenant ...' : 'Create'}
              </Button>
            </div>
          </fieldset>
        </Form>
        {/* Create Tenant form - END */}
      </div>
    </div>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof createTenantSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())
  const result = createTenantSchema.safeParse(formData)
  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const {
    exchangeRatesUrl,
    webhookUrl,
    webhookTimeout,
    webhookMaxRetry,
    walletAddressUrl,
    ilpAddress,
    ...restOfData
  } = result.data

  const settingsFormData = {
    exchangeRatesUrl,
    webhookUrl,
    webhookTimeout,
    webhookMaxRetry,
    walletAddressUrl,
    ilpAddress
  }
  const settingNameToKey = {
    exchangeRatesUrl: TenantSettingKey.ExchangeRatesUrl,
    webhookUrl: TenantSettingKey.WebhookUrl,
    webhookTimeout: TenantSettingKey.WebhookTimeout,
    webhookMaxRetry: TenantSettingKey.WebhookMaxRetry,
    walletAddressUrl: TenantSettingKey.WalletAddressUrl,
    ilpAddress: TenantSettingKey.IlpAddress
  }
  const tenantSettings = []
  for (const [key, value] of Object.entries(settingsFormData)) {
    if (value)
      tenantSettings.push({
        key: settingNameToKey[key as keyof typeof settingNameToKey],
        value: String(value)
      })
  }

  const response = await createTenant(request, {
    ...restOfData,
    settings: tenantSettings
  })
  if (!response?.tenant) {
    errors.message = ['Could not create tenant. Please try again!']
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Tenant created.',
      type: 'success'
    },
    location: `/tenants/${response.tenant?.id}`
  })
}
