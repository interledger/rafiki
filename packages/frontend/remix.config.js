/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  ignoredRouteFiles: ['**/.*'],
  tailwind: true,
  postcss: true,
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // serverBuildPath: "build/index.js",
  // publicPath: "/build/",
  serverModuleFormat: 'cjs',
  serverDependenciesToBundle: [
    '@apollo/client',
    'ts-invariant',
    '@wry/equality',
    '@wry/trie',
    'zen-observable-ts',
    'optimism',
    '@wry/caches',
    '@wry/context'
  ],
  future: {
    v2_routeConvention: true,
    v2_errorBoundary: true,
    v2_normalizeFormMethod: true,
    v2_headers: true,
    v2_meta: true,
    v2_dev: true
  }
}
