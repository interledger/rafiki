# Asset

An Asset consists of two pieces of information, code and scale. The asset code SHOULD be an [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217). The asset scale is the difference in orders of magnitude between the standard unit and a corresponding fractional unit. For example, considering the asset `{ code: 'USD', scale: 2 }`, an amount of $42.42 is expressed as `{ value: 4242, code: 'USD', scale: 2 }`.

Within Rafiki, the resource `asset` additionally contains the following information:

- `id`: identifier
- `withdrawalThreshold`: defines the minimum withdrawal amount
