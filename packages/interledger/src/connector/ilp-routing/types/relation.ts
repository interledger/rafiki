export type Relation = 'parent' | 'child' | 'peer' | 'local'

export function getRelationPriority(relation: Relation): number {
  return {
    parent: 0,
    peer: 1,
    child: 2,
    local: 3
  }[relation]
}
