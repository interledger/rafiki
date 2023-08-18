export function normalizeAsset(
  inputScale: number,
  outputScale: number,
  value: bigint
): bigint {
  const scaleDifference = BigInt(outputScale) - BigInt(inputScale)

  return scaleDifference > 0
    ? value * 10n ** scaleDifference
    : value / 10n ** (-1n * scaleDifference)
}
