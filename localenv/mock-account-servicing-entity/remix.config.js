/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  ignoredRouteFiles: ['**/.*'],
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // serverBuildPath: "build/index.js",
  // publicPath: "/build/",
  serverDependenciesToBundle: [
    'axios',
    'ts-invariant',
    '@wry/equality',
    '@wry/trie',
    '@wry/caches',
    '@wry/context',
    'zen-observable-ts',
    'optimism',
    '@apollo/client'
  ],
  serverModuleFormat: 'cjs',
  future: {
    v2_routeConvention: true,
    v2_headers: true,
    v2_dev: true
  }
}
