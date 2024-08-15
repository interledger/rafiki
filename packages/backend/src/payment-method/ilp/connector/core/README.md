# `core`

> Toolkit comprised of core services and middleware needed to develop ILP applications.

## Telemetry Collection

Currently, we collect packet count and packet amount metrics directly within the connector core. These metrics are captured at the Interledger layer to track packet activity while ensuring privacy by collecting amounts at the packet level, rather than at the transaction level. This approach helps to preserve privacy, as we do not expose entire transaction amounts, while also incorporating privacy-preserving measures into the collected amounts. You can read more about privacy [here](https://rafiki.dev/telemetry/privacy/).

### Why We Collect on the Sending Side

The first decision in collecting this data was whether to do so on the sender's side or the receiver's side. We opted for the sender’s side to maintain consistency across our metrics, particularly for calculating average transaction amounts and times, which are tied to the outgoing payment flow in the Open Payments (OP) layer. By collecting metrics from the same perspective, we ensure alignment with how other metrics (like transaction completion times) are captured.

We also considered collecting metrics on both the sending and receiving sides, capturing metrics when prepare packets were received by the receiver and when fulfill or reject responses were received by the sender. However, this could lead to unreliable metrics, as telemetry is optional and might not be enabled on all nodes.

### Why We Chose handleIlpData

Given these considerations, we decided to place our packet count and amount metrics in the `handleIlpData` function within the Rafiki Connector Core. This function plays a crucial role in processing ILP packets, handling both outgoing payments and quotes.

The specific metrics we collect here include:

- packet_count_prepare: Counts the prepare packets sent, collected before the middleware routes are executed.
- packet_count_fulfill: Counts the fulfill packets received, collected after receiving a reply from the receiver.
- packet_count_reject: Counts the reject packets received.
- packet_amount_fulfill: Records the amount sent in fulfill packets.

These metrics provide valuable insights, including potential packet loss.

### Challenges with the Current Setup

While `handleIlpData` is an effective location for telemetry collection, it has some limitations:

Sender-Side Limitation: Currently, metrics are only collected on the sender side. This is adequate for now but does not capture data from connecting nodes, which we plan to address in future implementations when multi-hop support is added.

### Other Considered Locations for Metrics Collection

We explored several alternative locations for collecting telemetry metrics within the Rafiki Connector Core:

- Dedicated Middleware: Initially, we implemented a dedicated telemetry middleware. However, this approach resulted in data being duplicated on both the sender and receiver sides, leading to inaccurate metrics. To address this, we would need to filter the data to ensure metrics are only collected on the sender side. Additionally, the telemetry middleware would need to effectively handle errors thrown in the middleware chain. To achieve this, it might be necessary to place the telemetry middleware right before the error-handling middleware, allowing it to catch and reflect any errors that occur. This would involve collecting the prepare packet count, wrapping the `next()` function in a try-catch block to capture any new errors, and then collecting reply and amount metrics after `next()` has resolved.
- `ilpHandler` on the Receiving Side: We also considered adding telemetry to the `ilpHandler` function, which processes middleware on receiving and connecting nodes. However, this would lead to a fragmented metric collection, with some metrics gathered on the receiver side and others on the sender side. This fragmentation could complicate the handling of concepts like transaction count, which would require dual collection on both sender and receiver sides. We'd also have to watch for the possibility of data duplication on the connectors because their middleware might trigger in each direction, as they receive prepares and again as they receive responses.

### Moving Forward

As we implement multi-hop capabilities and further refine the connector architecture, we will likely identify better entry and exit points for telemetry collection. This will allow us to capture a more comprehensive set of metrics across both sender and receiver nodes, ensuring a complete and accurate understanding of the network’s behavior.
