import { Reader } from 'oer-utils'
export function dateToInterledgerTime(date: Date): string {
  const pad = (n: number): string => (n < 10 ? '0' + n : String(n))

  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5)
  )
}

export function modifySerializedIlpPrepare(
  prepare: Buffer,
  amount?: bigint,
  expiresAt?: Date
): Buffer {
  if (amount || expiresAt) {
    const reader = new Reader(prepare)
    reader.skip(1) // skip packet type
    reader.readLengthPrefix()
    if (amount) {
      prepare.write(
        amount.toString(16).padStart(8 * 2, '0'),
        reader.cursor,
        8,
        'hex'
      )
    }
    if (expiresAt) {
      // Note the above write does not move the cursor as well, so we need to manually move it
      reader.skip(8)
      prepare.write(dateToInterledgerTime(expiresAt), reader.cursor, 17)
    }
  }
  return prepare
}
