import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useState } from 'react'
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Select, Text, TextField } from '@radix-ui/themes'
import { ErrorPanel, FieldError } from '~/components/ui'
import { createAsset } from '~/lib/api/asset.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { createAssetSchema } from '~/lib/validate.server'
import type { ZodFieldErrors } from '~/shared/types'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { whoAmI, loadTenants } from '~/lib/api/tenant.server'
import { getSession } from '~/lib/session.server'

type FormFieldProps = {
  name: string
  label: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'
  error?: string | string[]
  required?: boolean
}

type SelectOption = {
  label: string
  value: string
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
    <Text asChild size='2' weight='medium' className='tracking-wide text-gray-700'>
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
      size='3'
      className='w-full'
    />
    <FieldError error={error} />
  </Flex>
)

type SelectFieldProps = {
  label: string
  name: string
  options: SelectOption[]
  placeholder: string
  required?: boolean
  error?: string | string[]
  defaultValue?: SelectOption
}

const SelectField = ({
  label,
  name,
  options,
  placeholder,
  required,
  error,
  defaultValue
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
      <input type='hidden' name={name} value={selectedValue} />
      <div className='relative'>
        <Select.Root
          defaultValue={defaultValue?.value}
          onValueChange={(value) => setSelectedValue(value)}
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
      <FieldError error={error} />
    </Flex>
  )
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const session = await getSession(cookies)
  const sessionTenantId = session.get('tenantId')

  const { isOperator } = await whoAmI(request)
  let tenants
  if (isOperator) {
    tenants = await loadTenants(request)
  }
  return json({ tenants, sessionTenantId })
}

export default function CreateAssetPage() {
  const { tenants, sessionTenantId } = useLoaderData<typeof loader>()
  const response = useActionData<typeof action>()
  const { state } = useNavigation()
  const isSubmitting = state === 'submitting'

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Create Asset</Heading>

        <ErrorPanel errors={response?.errors.message} />

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
                      <div className='grid gap-4 md:grid-cols-2'>
                        <FormField
                          name='code'
                          label='Code'
                          placeholder='Code'
                          error={response?.errors?.fieldErrors.code}
                          required
                        />
                        <FormField
                          name='scale'
                          label='Scale'
                          placeholder='Scale'
                          error={response?.errors?.fieldErrors.scale}
                          required
                        />
                      </div>
                      <FormField
                        type='number'
                        name='withdrawalThreshold'
                        label='Withdrawal Threshold'
                        placeholder='Withdrawal Threshold'
                        error={response?.errors.fieldErrors.withdrawalThreshold}
                      />
                      {tenants && (
                        <SelectField
                          options={tenants.map((tenant) => ({
                            label: `${tenant.node.id}${
                              tenant.node.publicName
                                ? ` (${tenant.node.publicName})`
                                : ''
                            }`,
                            value: tenant.node.id
                          }))}
                          name='tenantId'
                          placeholder='Select tenant...'
                          defaultValue={{
                            label: sessionTenantId,
                            value: sessionTenantId
                          }}
                          label='Tenant Id'
                          required
                          error={response?.errors?.fieldErrors.tenantId}
                        />
                      )}
                    </Flex>
                  </Flex>
                </Box>

                <Flex justify='end'>
                  <Button aria-label='create asset' type='submit'>
                    {isSubmitting ? 'Creating asset ...' : 'Create'}
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
    fieldErrors: ZodFieldErrors<typeof createAssetSchema>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = createAssetSchema.safeParse(formData)

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const response = await createAsset(request, {
    ...result.data,
    ...(result.data.withdrawalThreshold
      ? { withdrawalThreshold: result.data.withdrawalThreshold }
      : { withdrawalThreshold: undefined })
  })

  if (!response?.asset) {
    errors.message = ['Could not create asset. Please try again!']
    return json({ errors }, { status: 400 })
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Asset created.',
      type: 'success'
    },
    location: `/assets/${response.asset?.id}`
  })
}
