## ILP static routing

At startup of a Rafiki instance, static routes are loaded from the database and stored in the in memory routing table. All subsequent peer updates will also refresh the routing table. For backwards compatibility, if no routes exist then direct peers' address and asset id will be used to populate the routing table.

A routing table entry has the following structure:

| `tenantId:destination` | `next hop` | `asset id` |

where:

- `tenantId` is the tenant id of the caller
- `destination` is the static ILP address of the payment receiver.
- `next hop` is the peer id of the direct peer that will either route or be the destination of the packet
- `asset id` is the asset id of the next hop peer -> this field is mandatory when adding/removing a route but not when querying for the next hop, as one could or could not be interested in what asset the peering relationship has when forwarding the packet.

`tenantId:destination` is called `prefix` in the implementation and is the key of the table. **Longest prefix matching is done against this key.**
