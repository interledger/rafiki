const path = require('path')

module.exports = {
  mode: 'production',
  entry: {
    'json-canonicalize': './src/json-canonicalize.js' /*,
    'tweetnacl': './src/tweetnacl.js',
    'tweetnacl-util': './src/tweetnacl-util.js'
    'open-payments': './src/open-payments.js'
    'http-message-signatures': './src/http-message-signatures.js',
    'httpbis-digest-headers': './src/httpbis-digest-headers.js'*/
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs',
    filename: '[name].bundle.js'
  },
  module: {
    rules: [{ test: /\.js$/, use: 'babel-loader' }]
  },
  target: 'web',
  externals: /k6(\/.*)?/,
  resolve: {
    fallback: {
      path: false,
      crypto: false,
      fs: false,
      os: false,
      stream: false,
      buffer: false,
      util: false,
      url: false,
      http: false,
      https: false,
      zlib: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false,
      dgram: false,
      querystring: false,
      string_decoder: false,
      punycode: false,
      readline: false,
      repl: false,
      vm: false,
      assert: false,
      constants: false,
      events: false,
      module: false,
      process: false,
      timers: false
    }
  }
}
