import { Link, type LinkProps } from '@remix-run/react'
import { forwardRef, type ComponentProps } from 'react'

type AnchorOrLinkProps = ComponentProps<'a'> & Partial<LinkProps>

const AnchorOrLink = forwardRef<HTMLAnchorElement, AnchorOrLinkProps>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ children, href, prefetch, to, ...props }, ref: any) => {
    const isAnchor = typeof href !== 'undefined'

    if (isAnchor) {
      if (prefetch) {
        console.warn(
          'Property "prefetch" does not have any effect when using it with simple anchor tag.'
        )
      }

      return (
        <a
          ref={ref}
          target='_blank'
          rel='noreferrer noopener'
          href={href}
          {...props}
        >
          {children}
        </a>
      )
    }

    return (
      <Link to={to ?? '/'} ref={ref} prefetch={prefetch} {...props}>
        {children}
      </Link>
    )
  }
)
AnchorOrLink.displayName = 'AnchorOrLink'

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
