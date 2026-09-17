import type {
  UiNode,
  UiNodeAttributes,
  UiNodeGroupEnum,
  UiNodeInputAttributes
} from '@ory/client'

// Replaces the two helpers we used from @ory/integrations/ui. That package is archived and
// is a Next.js integration, so it pulled Next into this Remix app as a transitive dependency.

const DEFAULT_GROUP: UiNodeGroupEnum = 'default'

/**
 * Kratos returns one flat node list per flow, tagged by method group. Each form we render
 * posts on its own, so it needs its own method's nodes (fields plus the `method` submit
 * node) and the shared `default` nodes, which is where the CSRF token lives.
 *
 * Ory's own component library does the same thing — it groups by node group and renders
 * the `default` group into every section:
 * https://github.com/ory/elements/blob/main/packages/elements-react/src/components/settings/settings-card.tsx
 */
export function formNodes(nodes: UiNode[], method: UiNodeGroupEnum): UiNode[] {
  return nodes.filter(
    ({ group }) => group === method || group === DEFAULT_GROUP
  )
}

export function isUiNodeInputAttributes(
  attributes: UiNodeAttributes
): attributes is UiNodeInputAttributes & { node_type: 'input' } {
  return attributes.node_type === 'input'
}
