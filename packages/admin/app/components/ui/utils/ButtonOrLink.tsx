import { type LinkProps } from '@remix-run/react'
import { forwardRef, type ComponentProps } from 'react'
import AnchorOrLink, { type AnchorOrLinkProps } from './AnchorOrLink'

export type ButtonOrLinkProps = Omit<
  ComponentProps<'button'> & AnchorOrLinkProps,
  'ref'
> &
  (
    | { to: LinkProps['to']; href?: never }
    | { to?: never; href: string }
    | { to?: never; href?: never }
  )

export const ButtonOrLink = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonOrLinkProps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
>(({ to, href, ...props }, ref: any) => {
  const isLink = typeof to !== 'undefined' || typeof href !== 'undefined'

  if (isLink) {
    return <AnchorOrLink href={href} to={to} ref={ref} {...props} />
  }

  return <button ref={ref} {...props} type={props.type ?? 'button'} />
})

ButtonOrLink.displayName = 'ButtonOrLink'
