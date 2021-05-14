# Rafiki API Testing

## Overview
API testing uses Cucumber.js + PactumJS.

Cucumber.js:
https://cucumber.io/docs/cucumber/

Gherkin Syntax:
https://cucumber.io/docs/gherkin/

PactumJS:
https://pactumjs.github.io/#/pactum

PactumJS + Cucumber boilerplate:
https://github.com/pactumjs/pactum-cucumber-boilerplate


## Running tests
From root of project:
```shell
yarn workspace api-test test
```


## File structure
### api
cucumber.js: Config file

### api/features
Feature files (gherkin)

### api/features/step_definitions
implements gherkin steps

