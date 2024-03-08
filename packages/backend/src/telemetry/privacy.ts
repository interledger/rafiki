export type ClipParams = {
  minBucketSize: number
  maxBucketSize: number
}

export const privacy = {
  getBucketSize: function (rawValue: number, clip: ClipParams): number {
    const { minBucketSize, maxBucketSize } = clip

    // Base parameter is used in the logarithimc function for calculating the bucket size when the rawValue exceeds the threshold.
    // Increasing the base would result in larger bucket sizes.
    const base = 2
    // The scale parameter is used in both the linear and logarithmic functions for calculating the bucket size.
    // Increasing the scale would result in larger bucket sizes.
    const scale = 5000
    // Used to determine when to switch from linear to logarithmic function
    // Increasing the threshold would result in smaller bucket sizes.
    const threshold = 20000

    let bucketSize
    if (rawValue < threshold) {
      bucketSize = Math.round(rawValue / scale) * scale
    } else {
      bucketSize =
        Math.pow(base, Math.ceil(Math.log(rawValue / scale) / Math.log(base))) *
        scale
    }

    return Math.max(minBucketSize, Math.min(bucketSize, maxBucketSize))
  },

  generateLaplaceNoise: function (scale: number): number {
    const u = Math.random() - 0.5
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
  },

  computePrivacyParameter: function (sensitivity: number): number {
    return sensitivity * 0.1
  },

  roundValue: function (
    rawValue: number,
    bucketSize: number,
    clip: ClipParams
  ): number {
    rawValue = Math.min(rawValue, clip.maxBucketSize)
    rawValue = Math.max(rawValue, clip.minBucketSize)
    const lowerBound = Math.floor(rawValue / bucketSize) * bucketSize
    const upperBound = Math.ceil(rawValue / bucketSize) * bucketSize
    const median = (lowerBound + upperBound) / 2
    const roundedValue = rawValue <= median ? lowerBound : upperBound
    return Math.max(roundedValue, bucketSize / 2)
  },

  applyPrivacy: function (
    rawValue: number,
    clip: ClipParams = {
      minBucketSize: 2500,
      maxBucketSize: 10000000
    }
  ): number {
    const bucketSize = this.getBucketSize(rawValue, clip)
    let roundedValue = this.roundValue(rawValue, bucketSize, clip)
    const privacyParameter = this.computePrivacyParameter(
      Math.max(roundedValue / 10, bucketSize)
    )
    const laplaceNoise = this.generateLaplaceNoise(privacyParameter)
    roundedValue += Math.round(laplaceNoise)
    if (roundedValue === 0) {
      roundedValue = bucketSize / 2
    }
    return roundedValue
  }
}
