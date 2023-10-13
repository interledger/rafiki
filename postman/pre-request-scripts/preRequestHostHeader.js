const url = require('url')

const requestUrl = url.parse(
  request.url.replace(/{{([A-Za-z]\w+)}}/g, (_, key) => pm.environment.get(key))
)

if (requestUrl.hostname === 'localhost') {
  const hostHeader =
    requestUrl.port === '3000'
      ? pm.environment.get('host3000')
      : pm.environment.get('host4000')
  pm.request.headers.add({
    key: 'Host',
    value: hostHeader
  })
  request.headers['host'] = hostHeader
}
