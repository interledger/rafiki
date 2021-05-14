/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('assert');
const { Given, When, Then, Before, After } = require('@cucumber/cucumber');
const pactum = require('pactum');
const expect = pactum.expect;

let spec = pactum.spec();
let response = null;

Before(() => {
  spec = pactum.spec();
});

After(() => {
  spec.end();
});


function isItFriday(today) {
  return 'Nope';
}

Given('today is Sunday', function () {
  this.today = 'Sunday';
});

When('I ask whether it\'s Friday yet', function () {
  this.actualAnswer = isItFriday(this.today);
});

Then('I should be told {string}', function (expectedAnswer) {
  assert.strictEqual(this.actualAnswer, expectedAnswer);
});

Given(/^I request a random inspirational quote$/, async function() {
  spec.get('http://api.forismatic.com/api/1.0/?method=getQuote&format=text&lang=en');
  response = await spec.toss();
});

Then(/^I successfully get the inspirational quote$/, function() {
  expect(response).to.have.status(200);
  console.log(`\n${response.body}\n`)
});