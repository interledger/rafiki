# Privacy in Rafiki Telemetry

Rafiki telemetry is designed with privacy in mind. User data is anonymized and no identifiable information is collected from the user. Transactions can come from any user to a Rafiki instance, so the privacy concerns we are addressing are at the Rafiki instance level in the network, not at the user level.

## Differential Privacy and Local Differential Privacy

Differential Privacy is a system for publicly sharing information about a dataset by describing the patterns of groups within the dataset while withholding information about individuals in the dataset. Local Differential Privacy (LDP) is a variant of differential privacy where noise is added to each individual's data before it is sent to the server. This ensures that the server never sees the actual data, providing a strong privacy guarantee.

# Rounding Technique and Bucketing

In our implementation, we use a rounding technique that essentially aggregates multiple transactions into the same value, making them indistinguishable. This is achieved by dividing the transaction values into buckets and rounding the values to the nearest bucket.

The bucket size is calculated based on the raw transaction value. For lower value transactions, which are expected to occur more frequently, the bucket sizes are determined linearly for higher granularity. However, after a certain threshold, the bucket size calculation switches to a logarithmic function to ensure privacy for higher value transactions, which are less frequent but pose greater privacy concerns.

To handle outliers, we also implement a "clipping" technique where the buckets are capped. Any value that exceeds a given threshold is placed in a single bucket. This ensures that outliers do not disproportionately affect the overall data, providing further privacy guarantees for these high-value transactions.

## Laplacian Noise

To achieve LDP, we add Laplacian noise to the rounded values. The Laplacian noise is generated based on a privacy parameter, which is calculated using the sensitivity of the function.

The sensitivity of a function in differential privacy is the maximum amount that any single observation can change the output of the function. In our case, we consider the sensitivity to be the maximum of the rounded value and the bucket size.

The privacy parameter is computed as one-tenth of the sensitivity. This parameter controls the trade-off between privacy and utility: a smaller privacy parameter means more privacy but less utility, and a larger privacy parameter means less privacy but more utility.

The Laplacian noise is then generated using this privacy parameter and added to the rounded value. If the resulting value is zero, it is set to half the bucket size to ensure that the noise does not completely obscure the transaction value.

## Achieving Local Differential Privacy

This implementation achieves Local Differential Privacy by adding noise to each individual's data before it is sent to the server. The noise is generated based on the sensitivity of the function and a privacy parameter, ensuring that the server never sees the actual data. This provides a strong privacy guarantee, while still allowing for useful patterns in the data to be observed at the Rafiki instance level.

## Currency Conversion

Another factor that increases deniability is currency conversion. In cross-currency transactions, we use exchange rates that are not traced back. This introduces an additional layer of noise and further protects the privacy of the transactions.

## References

Rafiki's telemetry solution is a combination of techniques described in various white papers on privacy-preserving data collection. For more information, you can refer to the following papers:

- [Local Differential Privacy for Human-Centered Computing](https://proceedings.neurips.cc/paper_files/paper/2017/file/253614bbac999b38b5b60cae531c4969-Paper.pdf)
- [Collecting Telemetry Data Privately](https://www.microsoft.com/en-us/research/blog/collecting-telemetry-data-privately/)
- [Collecting Telemetry Data Privately - NeurIPS Publication](https://proceedings.neurips.cc/paper_files/paper/2017/file/253614bbac999b38b5b60cae531c4969-Paper.pdf) by Bolin Ding, Janardhan Kulkarni, Sergey Yekhanin from Microsoft Research.
- [RAPPOR: Randomized Aggregatable Privacy-Preserving Ordinal Response](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/42852.pdf)

# Experimental Transaction Values when using the Algorithm

The following table shows the values in the algorithm when running transactions for different amounts. The raw value increases as you go down the rows of the table.
(all values are in scale 4)
| Raw Value | Bucket Size | Rounded Value | Privacy Parameter | Laplace Noise | Final Value |
|-----------|-------------|---------------|-------------------|---------------|-------------|
| 8300 | 10000 | 10000 | 1000 | 2037 | 12037 |
| 13200 | 15000 | 15000 | 1500 | 1397 | 16397 |
| 147700 | 160000 | 160000 | 16000 | -27128 | 132872 |
| 1426100 | 2560000 | 2560000 | 256000 | -381571 | 2178429 |
| 1788200 | 2560000 | 2560000 | 256000 | 463842 | 3023842 |
| 90422400 | 10000000 | 90000000 | 1000000 | 2210649 | 92210649 |
| 112400400 | 10000000 | 100000000 | 1000000 | 407847 | 100407847 |
| 222290500 | 10000000 | 100000000 | 1000000 | -686149 | 99313851 |

These values are generated by the `applyPrivacy` method in the `meter.ts` file. This method takes a raw value, calculates a bucket size, rounds the value, computes a privacy parameter, generates Laplace noise, and then adds the noise to the rounded value to get the final value.
