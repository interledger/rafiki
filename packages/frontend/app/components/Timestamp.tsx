export function Timestamp({ value }: { value: string }) {
  const { iso, default: formatted, long } = formatDate(value)
  return (
    <time dateTime={iso} title={long}>
      {formatted}
    </time>
  )
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return {
    iso: date.toISOString(),
    default: date.toLocaleString(),
    long: date.toLocaleString(undefined, {
      dateStyle: 'long',
      timeStyle: 'long'
    })
  }
}
