---
sidebar_position: 1
---

# Account Provider

An account provider is an entity that provides accounts to [account holders](../concepts/account-holder).

An example of an account provider is a bank, a cryptocurrency wallet, a mobile money provider.

In the context of Rafiki, an account provider is the entity that will run an instance of Rafiki and integrate it into their internal systems.

The functions of the account provider include:

- Provide channels for account holders to interact with their accounts (mobile apps, websites, etc)
- Onboarding account holders as required under regulations (KYC, sanctions screening, etc)
- Maintaining the ledger of accounts of account holders
- Handling deposits and withdrawals into accounts via external payment methods (cards, bank transfers, etc)
- Authenticating account holders
- Getting consent from account holders to grant access to their accounts
- Keeping a record of the public keys used by account holders to access the Open Payments APIs
