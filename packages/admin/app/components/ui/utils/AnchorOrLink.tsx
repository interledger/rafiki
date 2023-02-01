import { type ComponentProps, forwardRef } from 'react'
import { Link, type LinkProps } from '@remix-run/react'

export type AnchorOrLinkProps = ComponentProps<'a'> & Partial<LinkProps>

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

export default AnchorOrLink
