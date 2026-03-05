# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.4.0-alpha.9](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.8...@interledger/pay@0.4.0-alpha.9) (2022-09-28)

**Note:** Version bump only for package @interledger/pay

# [0.4.0-alpha.8](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.7...@interledger/pay@0.4.0-alpha.8) (2022-08-18)

**Note:** Version bump only for package @interledger/pay

# [0.4.0-alpha.7](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.6...@interledger/pay@0.4.0-alpha.7) (2022-06-20)

### Features

- **ilp-pay:** allow connection url as payment destination ([#290](https://github.com/interledgerjs/interledgerjs/issues/290)) ([fdfd4e6](https://github.com/interledgerjs/interledgerjs/commit/fdfd4e638399e40b675f75be01eb7c3e08e9545c))

# [0.4.0-alpha.6](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.5...@interledger/pay@0.4.0-alpha.6) (2022-06-10)

**Note:** Version bump only for package @interledger/pay

# [0.4.0-alpha.5](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.4...@interledger/pay@0.4.0-alpha.5) (2022-05-04)

**Note:** Version bump only for package @interledger/pay

# [0.4.0-alpha.4](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.3...@interledger/pay@0.4.0-alpha.4) (2022-04-27)

### Bug Fixes

- fixing eslint issues ([6093679](https://github.com/interledgerjs/interledgerjs/commit/6093679060d9f27911e2fd3f0dbbf15ebae6f538))
- tests which broke due to updated tooling ([eea42af](https://github.com/interledgerjs/interledgerjs/commit/eea42af4530c00cbd0736a962aed92251ac136cd))

### BREAKING CHANGES

- Add `isConnected` property to the Plugin interface in ilp-plugin. This property should have already been there and most plugins are likely to implement it because it is required in other contexts. For example, ilp-protocol-stream requires it.

# [0.4.0-alpha.3](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.2...@interledger/pay@0.4.0-alpha.3) (2022-04-11)

### Bug Fixes

- specify 'Content-Type' in POST request ([67fef5d](https://github.com/interledgerjs/interledgerjs/commit/67fef5d2fecbc4da4106161ad397ca34e788d12c))

# [0.4.0-alpha.2](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.1...@interledger/pay@0.4.0-alpha.2) (2022-04-01)

**Note:** Version bump only for package @interledger/pay

# [0.4.0-alpha.1](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.4.0-alpha.0...@interledger/pay@0.4.0-alpha.1) (2022-03-30)

### Bug Fixes

- **pay:** fix log.debug format string ([e4377d0](https://github.com/interledgerjs/interledgerjs/commit/e4377d06a2b5761b051bcfe8257ba90471e19dcf))

### Features

- **pay:** create Incoming Payment in setupPayment ([8af8d35](https://github.com/interledgerjs/interledgerjs/commit/8af8d35d3ebcf052cfb813048becb816d50c253a))

# [0.4.0-alpha.0](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.3.3...@interledger/pay@0.4.0-alpha.0) (2022-03-21)

### Features

- **pay:** update to Open Payments v2 ([#262](https://github.com/interledgerjs/interledgerjs/issues/262)) ([82da805](https://github.com/interledgerjs/interledgerjs/commit/82da8058a1e545519b84589b6543442a755dbf0c))

## [0.3.3](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.3.2...@interledger/pay@0.3.3) (2021-11-09)

### Bug Fixes

- **pay:** invoice url can be distinct from account url ([dd67b42](https://github.com/interledgerjs/interledgerjs/commit/dd67b42faef9a35e5291b0f3300072982c9f6a4c))

## [0.3.2](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.3.1...@interledger/pay@0.3.2) (2021-10-25)

### Bug Fixes

- **pay:** fix flaky test ([8e218c0](https://github.com/interledgerjs/interledgerjs/commit/8e218c034aa763700391995fcfbc50f47c01ff97))

## [0.3.1](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.3.0...@interledger/pay@0.3.1) (2021-10-07)

**Note:** Version bump only for package @interledger/pay

# [0.3.0](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.2.2...@interledger/pay@0.3.0) (2021-08-03)

### Bug Fixes

- **pay:** comments ([4cd20c8](https://github.com/interledgerjs/interledgerjs/commit/4cd20c8b2dd80d0f72042913649bbd3a36a21461))
- **pay:** more comments ([b06a959](https://github.com/interledgerjs/interledgerjs/commit/b06a959eacb917ba629caf1e902d4277a1162ead))
- **pay:** Quote vs IntQuote ([ff1ad66](https://github.com/interledgerjs/interledgerjs/commit/ff1ad661a400810a911292077c9b398776dd06a6))
- **pay:** use BigInt instead of Int for api ([0f8a814](https://github.com/interledgerjs/interledgerjs/commit/0f8a8144f5f6f2331a05d6883842c1a4f5096731))
- address comments ([cc286ce](https://github.com/interledgerjs/interledgerjs/commit/cc286cea8e17380bc4a7db351cc45209d2bf43fe))

### Features

- **pay:** allow http payment pointers ([9118a03](https://github.com/interledgerjs/interledgerjs/commit/9118a03c2a05f34a9d66660eae99c81ad580a3c1))
- composable, stateless top-level functions ([20d92ce](https://github.com/interledgerjs/interledgerjs/commit/20d92ce1d4d6f4a3807164a14ec7d1b5aa968e1d))
- **pay:** internal api, send-only, receipts ([8ff7c2c](https://github.com/interledgerjs/interledgerjs/commit/8ff7c2cca1a3c8ab2f1a293eb04c0b07e05a7eaa))
- **pay:** top-level api, docs, spsp improvements ([82537ee](https://github.com/interledgerjs/interledgerjs/commit/82537ee1d845d400a3e9a9351ad4d5ddd0c293d9))

## [0.2.2](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.2.1...@interledger/pay@0.2.2) (2020-07-27)

**Note:** Version bump only for package @interledger/pay

## [0.2.1](https://github.com/interledgerjs/interledgerjs/compare/@interledger/pay@0.2.0...@interledger/pay@0.2.1) (2020-07-27)

**Note:** Version bump only for package @interledger/pay

# 0.2.0 (2020-07-24)

### Bug Fixes

- only share address to fetch asset details ([af8eb92](https://github.com/interledgerjs/interledgerjs/commit/af8eb920eea859951fc8e826541b9f8588e2f138))

### Features

- **pay:** add backoff to pacer ([15c2de4](https://github.com/interledgerjs/interledgerjs/commit/15c2de48d3e6f21559488ff6125d30419ad28cda))
- **pay:** discover precise max packet amount ([dfe2164](https://github.com/interledgerjs/interledgerjs/commit/dfe2164dcd30d0d3cbe9f3b5275b6561bbb1f355))
- estimate duration, min delivery amount ([d0f2ace](https://github.com/interledgerjs/interledgerjs/commit/d0f2ace899c1f28cff64b747f051603c8bc3eea2))
- robust amount strategy, rate errors ([fdcb132](https://github.com/interledgerjs/interledgerjs/commit/fdcb1324e5e8285da528b60b5c23098324efb9dc))
- **pay:** open payments support ([2d4ba19](https://github.com/interledgerjs/interledgerjs/commit/2d4ba19275b444e46845a9114537b624d939f5ae))
- stateless stream receiver ([aed91d8](https://github.com/interledgerjs/interledgerjs/commit/aed91d85c06aa73af77a8c3891d388257b74ede8))
- STREAM payment library alpha, ci updates ([#17](https://github.com/interledgerjs/interledgerjs/issues/17)) ([4e128bc](https://github.com/interledgerjs/interledgerjs/commit/4e128bcee372144c1324a73e8b51223a0b133f2e))
