# Privacy in Rafiki Telemetry

Rafiki telemetry is designed with a strong emphasis on privacy. The system anonymizes user data and refrains from collecting identifiable information. Since transactions can originate from any user to a Rafiki instance, the privacy measures are implemented at the Rafiki instance level in the network. This means that at the individual level, the data is already anonymous as single Rafiki instances service transactions for multiple users.

## Differential Privacy and Local Differential Privacy

Differential Privacy is a system for publicly sharing information about a dataset by describing the patterns of groups within the dataset while withholding information about individuals in the dataset. Local Differential Privacy (LDP) is a variant of differential privacy where noise is added to each individual's data before it is sent to the server. This ensures that the server never sees the actual data, providing a strong privacy guarantee.

# Rounding Technique and Bucketing

In our implementation, we use a rounding technique that essentially aggregates multiple transactions into the same value, making them indistinguishable. This is achieved by dividing the transaction values into buckets and rounding the values to the nearest bucket.

The bucket size is calculated based on the raw transaction value. For lower value transactions, which are expected to occur more frequently, the bucket sizes are determined linearly for higher granularity. However, after a certain threshold, the bucket size calculation switches to a logarithmic function to ensure privacy for higher value transactions, which are less frequent but pose greater privacy concerns.

To handle outliers, a "clipping" technique is implemented, capping the buckets. Any value that exceeds a given threshold is placed in a single bucket. Conversely, any value that falls below a certain minimum is also placed in a single bucket. This ensures that both high and low outliers do not disproportionately affect the overall data, providing further privacy guarantees for these transactions.

## Laplacian Distribution

The Laplacian distribution is often used in differential privacy due to its double exponential decay property. This property ensures that a small change in the data will not significantly affect the probability distribution of the output, providing a strong privacy guarantee.

To achieve Local Differential Privacy (LDP), noise is selected from the Laplacian distribution and added to the rounded values. The noise is generated based on a privacy parameter, which is calculated using the sensitivity of the function.

The sensitivity of a function in differential privacy is the maximum amount that any single observation can change the output of the function. In this case, the sensitivity is considered to be the maximum of the rounded value and the bucket size.

The privacy parameter is computed as one-tenth of the sensitivity. This parameter controls the trade-off between privacy and utility: a smaller privacy parameter means more privacy but less utility, and a larger privacy parameter means less privacy but more utility.

The noise, selected from the Laplacian distribution, is then generated using this privacy parameter and added to the rounded value. If the resulting value is zero, it is set to half the bucket size to ensure that the noise does not completely obscure the transaction value.

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
