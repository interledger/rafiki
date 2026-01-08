import { json, type ActionFunctionArgs, redirect } from '@remix-run/node'
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import { ErrorPanel, FieldError } from '~/components/ui'
import { createTenant, whoAmI } from '~/lib/api/tenant.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createTenantSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { TenantSettingKey } from '~/generated/graphql'

type FormFieldProps = {
  name: string
  label: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'
  error?: string | string[]
  required?: boolean
}

const FormField = ({
  name,
  label,
  placeholder,
  type = 'text',
  error,
  required
}: FormFieldProps) => (
  <Flex direction='column' gap='2'>
    <Text asChild size='2' weight='medium'>
      <label htmlFor={name}>
        {label}
        {required ? <span className='text-vermillion'> *</span> : null}
      </label>
    </Text>
    <TextField.Root
      id={name}
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
    />
    <FieldError error={error} />
  </Flex>
)

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

  const tenantSettings: {
    name: string
    placeholder: string
    label: string
    type?: 'text' | 'email' | 'password' | 'number'
  }[] = [
    {
      name: 'exchangeRatesUrl',
      placeholder: 'Exhange Rates Url',
      label: 'Exchange Rates Url'
    },
    {
      name: 'webhookUrl',
      placeholder: 'Webhook Url',
      label: 'Webhook Url'
    },
    {
      name: 'webhookTimeout',
      placeholder: 'Webhook Timeout',
      label: 'Webhook Timeout',
      type: 'number'
    },
    {
      name: 'webhookMaxRetry',
      placeholder: 'Webhook Max Retry',
      label: 'Webhook Max Retry',
      type: 'number'
    },
    {
      name: 'walletAddressUrl',
      placeholder: 'Wallet Address Url',
      label: 'Wallet Address Url'
    },
    {
      name: 'ilpAddress',
      placeholder: 'ILP Address',
      label: 'ILP Address'
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
    <Box p='4'>
      <Card>
        <Flex direction='column' gap='5'>
          <Flex justify='between' align='center'>
            <Heading size='6'>Create Tenant</Heading>
            <Button asChild variant='soft' aria-label='go back to tenants page'>
              <Link to='/tenants'>Go to tenants page</Link>
            </Button>
          </Flex>

          <ErrorPanel errors={response?.errors.message} />

          <Form method='post' replace>
            <fieldset disabled={isSubmitting}>
              <Flex direction='column' gap='5'>
                <div className='grid grid-cols-1 gap-6 md:grid-cols-3 border-b border-pearl pb-6'>
                  <Box className='pt-1'>
                    <Text size='3' weight='medium'>
                      General Information
                    </Text>
                  </Box>
                  <Card className='md:col-span-2'>
                    <Flex direction='column' gap='3'>
                      <FormField
                        name='publicName'
                        label='Public Name'
                        placeholder='Public name'
                        error={response?.errors?.fieldErrors.publicName}
                      />
                      <FormField
                        name='email'
                        label='Email'
                        placeholder='Email'
                        type='email'
                        error={response?.errors?.fieldErrors.email}
                      />
                    </Flex>
                  </Card>
                </div>

                <div className='grid grid-cols-1 gap-6 md:grid-cols-3 border-b border-pearl pb-6'>
                  <Box className='pt-1'>
                    <Text size='3' weight='medium'>
                      Sensitive Information
                    </Text>
                  </Box>
                  <Card className='md:col-span-2'>
                    <Flex direction='column' gap='3'>
                      <FormField
                        name='apiSecret'
                        label='API Secret'
                        placeholder='The API secret. Treat as sensitive information.'
                        type='password'
                        error={response?.errors?.fieldErrors.apiSecret}
                        required
                      />
                    </Flex>
                  </Card>
                </div>

                <div className='grid grid-cols-1 gap-6 md:grid-cols-3 border-b border-pearl pb-6'>
                  <Box className='pt-1'>
                    <Text size='3' weight='medium'>
                      Identity Provider Information
                    </Text>
                  </Box>
                  <Card className='md:col-span-2'>
                    <Flex direction='column' gap='3'>
                      <FormField
                        name='idpConsentUrl'
                        label='Consent URL'
                        placeholder='Provide the Identity Provider Consent URL'
                        error={response?.errors?.fieldErrors.idpConsentUrl}
                      />
                      <FormField
                        name='idpSecret'
                        label='Secret'
                        placeholder='Provide the Identity Provider Secret'
                        type='password'
                        error={response?.errors?.fieldErrors.idpSecret}
                      />
                    </Flex>
                  </Card>
                </div>

                <div className='grid grid-cols-1 gap-6 md:grid-cols-3 border-b border-pearl pb-6'>
                  <Box className='pt-1'>
                    <Text size='3' weight='medium'>
                      Tenant Settings
                    </Text>
                  </Box>
                  <Card className='md:col-span-2'>
                    <Flex direction='column' gap='3'>
                      {tenantSettings.map((setting) => (
                        <FormField
                          key={setting.name}
                          name={setting.name}
                          label={setting.label}
                          placeholder={setting.placeholder}
                          type={setting.type}
                          error={getTenantSettingError(setting.name)}
                        />
                      ))}
                    </Flex>
                    <Box pt='3'>
                      <ErrorPanel errors={tenantSettingErrors} />
                    </Box>
                  </Card>
                </div>

                <Flex justify='end'>
                  <Button type='submit'>
                    {isSubmitting ? 'Creating tenant ...' : 'Create'}
                  </Button>
                </Flex>
              </Flex>
            </fieldset>
          </Form>
        </Flex>
      </Card>
    </Box>
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
