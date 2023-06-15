const COLORS = {
  key: 'text-tealish',
  number: 'text-blue-500',
  string: 'text-orange-500',
  boolean: 'text-teal-500',
  null: 'text-violet-500'
}

export const prettify = (json: object | string): string => {
  const regExp =
    // eslint-disable-next-line no-useless-escape
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g

  const content =
    typeof json === 'string'
      ? JSON.stringify(JSON.parse(json), null, 2)
      : JSON.stringify(json, null, 2)
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(regExp, (match) => {
      let color = COLORS['number']
      let extraClasses = ''

      if (/^"/.test(match)) {
        color = /:$/.test(match) ? COLORS['key'] : COLORS['string']
        extraClasses = !/:$/.test(match)
          ? 'break-words whitespace-pre-wrap'
          : ''
      } else if (/true|false/.test(match)) {
        color = COLORS['boolean']
      } else if (/null/.test(match)) {
        color = COLORS['null']
      }

      return `<span class="${color} ${extraClasses}">${match}</span>`
    })
}
