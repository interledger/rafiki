# Rafiki

## Table of Contents

1. [What is Rafiki?](#what-is-rafiki)
2. [Getting Started](#getting-started)
   1. [Workspaces](#workspaces)
      1. [How to share scripts between workspaces?](#how-to-share-scripts-between-workspaces)
   2. [Code quality](#code-quality)
      1. [Linting](#linting)
      2. [Formatting](#formatting)
      3. [Testing](#testing)
      4. [Commit hooks](#commit-hooks)
      5. [Language](#language)
      6. [CI](#ci)
3. [Packages](#packages)
   1. [Backend](#backend)
   2. [Connector](#connector)
   3. [Frontend](#frontend)
4. [Owners](#owners)

---

## What is Rafiki?

<img width="920" alt="rafiki" src="https://user-images.githubusercontent.com/3362563/119590055-e3347580-bd88-11eb-8ae7-958075433e48.png">

Rafiki is an open source package that exposes a comprehensive set of
Interledger APIs. It's intended to be run by wallet providers, allowing them to
offer Interledger functionality to their users.

Rafiki is made up of several components including an Interledger connector, a
high-throughput accounting database, and an API which can be accessed directly
by users to implement Interledger applications.

Rafiki also allows for delegated access, offering OAuth-based flows to grant
third-party applications access to Interledger functionality on a user's
account.

## Getting Started

This project uses yarn 2. We use [zero-installs](https://yarnpkg.com/features/zero-installs)
which means you won't need to install dependencies when you clone the repo.
This does have [security implications](https://yarnpkg.com/features/zero-installs#does-it-have-security-implications)
that are fairly easy to mitigate.

> DO NOT use `npm install`, this will cause the project to spontaneously self-destruct.

```shell
git clone git@github.com:coilhq/rafiki.git

# Build dependencies with install scripts
yarn install --immutable --immutable-cache
```

### Workspaces

We use [yarn workspaces](https://yarnpkg.com/features/workspaces) to manage the monorepo.
The [workspace](https://yarnpkg.com/cli/workspace) command should be used when
you want to run yarn commands in specific workspaces:

```shell
# Run a command within the specified workspace.
yarn workspace <workspaceName> <commandName> ...

# Add a package (knex) to a single workspace(backend):
yarn workspace backend add knex

# Run build script on a single workspace(backend):
yarn workspace backend build
```

#### How to share scripts between workspaces?

Any script with a colon in its name (build:foo) can be called from any workspace.
Additionally, `$INIT_CWD` will always point to the directory running the script.

We utilize this to write shared scripts once:

```shell
# Lint in the current workspace
cd packages/backend
yarn lint # runs yarn lint:local

# OR use the workspaces command
yarn workspace backend lint # runs yarn lint:local in the packages/backend directory
```

### Code quality

All the code quality tools used in the project are installed and configured at the root.
This allows for consistency across the monorepo. Allows new packages to be added with
minimal configuration overhead.

We try not to put config files in workspaces, unless absolutely necessary.

#### Linting

[Eslint](https://eslint.org/) is used for linting.

```shell
./.eslintrc.yml # config
./.eslintignore # ignore file
```

Eslint config should not be overridden in any packages.

#### Formatting

[Prettier](https://prettier.io/) is used for formatting.

```shell
./.prettierrc.yml # config
./.prettierignore # ignore file
```

Prettier config should not be overridden in any packages.

#### Testing

[Jest](https://jestjs.io/) is used for testing.

```shell
./jest.config.js # config used to configure projects and run all tests
./jest.config.base.js # (base jest config, imported by other packages)
./packages/*/jest.config.js # jest config file for package * (extends base.config.base.js)
```

Jest config at the root is intended to be a base config that should be extended by
each package to suit the package's testing requirements.

#### Commit hooks

[Husky](https://github.com/typicode/husky) provides git hooks.

```shell
./.husky/commit-msg # linting commit messages
./.husky/pre-commit # perform functions before committing
```

[Commitlint](https://commitlint.js.org/) is used for linting commit messages
so that they conform to [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

```shell
./commitlint.config.js # config
```

[Lint-staged](https://github.com/okonet/lint-staged) is used for linting and formatting staged files on commit.

```shell
./.lintstagedrc.yml # config
```

https://commitlint.js.org

#### Language

[Typescript](https://www.staging-typescript.org/) is the chosen language.

```shell
./tsconfig.json # config
```

Typescript config at the root is intended to be a base config that should be extended by
each package to suit the package's requirements.

#### CI

We use Github actions to manage our CI pipeline.

The workflows can be found in `.github/workflows`

---

## Packages

### Backend

TODO

### Connector

TODO

### Frontend

TODO

---

## Owners

@cairinmichie
@kincaidoneil
@matdehaast
@sentientwaffle
@sharafian
@wilsonianb
