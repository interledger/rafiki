import { BadgeColor } from '~/components'
import type {
  IncomingPaymentState,
  OutgoingPaymentState
} from '~/generated/graphql'
import { WalletAddressStatus } from '~/generated/graphql'
import { PaymentType } from '~/generated/graphql'

const COLORS = {
  key: 'text-tealish',
  number: 'text-blue-500',
  string: 'text-orange-500',
  boolean: 'text-teal-500',
  null: 'text-violet-500'
}

export const prettify = (json: object | string): string => {
  const regExp =
    // eslint-disable-next-line no-useless-escape
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g

  const content =
    typeof json === 'string'
      ? JSON.stringify(JSON.parse(json), null, 2)
      : JSON.stringify(json, null, 2)
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(regExp, (match) => {
      let color = COLORS['number']
      let extraClasses = ''

      if (/^"/.test(match)) {
        color = /:$/.test(match) ? COLORS['key'] : COLORS['string']
        extraClasses = !/:$/.test(match)
          ? 'break-words whitespace-pre-wrap'
          : ''
      } else if (/true|false/.test(match)) {
        color = COLORS['boolean']
      } else if (/null/.test(match)) {
        color = COLORS['null']
      }

      return `<span class="${color} ${extraClasses}">${match}</span>`
    })
}
export function formatAmount(amount: string, scale: number) {
  const value = BigInt(amount)
  const divisor = BigInt(10 ** scale)

  const integerPart = (value / divisor).toString()
  const fractionalPart = (value % divisor).toString().padStart(scale, '0')

  return `${integerPart}.${fractionalPart}`
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function getOpenPaymentsUrl() {
  if (typeof window === 'undefined') {
    if (!process.env.OPEN_PAYMENTS_URL) {
      throw new Error('Environment variable OPEN_PAYMENTS_URL is missing')
    }

    return process.env.OPEN_PAYMENTS_URL
  }

  if (!window.ENV.OPEN_PAYMENTS_URL) {
    throw new Error('Environment variable OPEN_PAYMENTS_URL is missing')
  }

  return window.ENV.OPEN_PAYMENTS_URL
}

export type CombinedPaymentState = IncomingPaymentState | OutgoingPaymentState

export const badgeColorByPaymentState: {
  [key in CombinedPaymentState]: BadgeColor
} = {
  COMPLETED: BadgeColor.Green,
  EXPIRED: BadgeColor.Yellow,
  PENDING: BadgeColor.Yellow,
  PROCESSING: BadgeColor.Yellow,
  FAILED: BadgeColor.Red,
  FUNDING: BadgeColor.Yellow,
  SENDING: BadgeColor.Yellow,
  CANCELLED: BadgeColor.Red
}

export const badgeColorByWalletAddressStatus: Record<
  WalletAddressStatus,
  BadgeColor
> = {
  [WalletAddressStatus.Active]: BadgeColor.Green,
  [WalletAddressStatus.Inactive]: BadgeColor.Red
}

export const paymentSubpathByType: {
  [key in PaymentType]: string
} = {
  [PaymentType.Incoming]: 'incoming',
  [PaymentType.Outgoing]: 'outgoing'
}

export const parseBool = (str: string) => {
  return ['true', 't', '1'].includes(str.toLowerCase())
}

export function removeTrailingAndLeadingSlash(str: string): string {
  if (!str.length) {
    return str
  }

  str = str.endsWith('/') ? str.slice(0, str.length - 1) : str
  str = str.startsWith('/') ? str.substring(1) : str

  return str
}
