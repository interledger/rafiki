Feature: Inspirational quote

  An example feature showing off using PactumJS

  As a software engineer wasting time,
  I want to get a random inspirational quote
  so that I can feel better about myself

  Scenario: Get random inspirational quote
    Given I request a random inspirational quote
    Then I successfully get the inspirational quote