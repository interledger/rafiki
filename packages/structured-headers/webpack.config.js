module.exports = [
  {
    entry: './dist/index',
    output: {
      path: __dirname + '/browser',
      filename: 'structured-header.min.js',
      library: 'structuredHeader'
    },

    resolve: {
      extensions: ['.web.ts', '.web.js', '.ts', '.js', '.json']
    },

    devtool: 'source-map',

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'awesome-typescript-loader'
        }
      ]
    },

  }
];
