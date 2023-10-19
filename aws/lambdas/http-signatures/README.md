# HTTP Signatures AWS Lambda

## Installation

1.  Navigate to this directory

```sh
$ cd /PATH/TO/RAFIKI/aws/lambdas/http-signatures
```

2.  Install the packages using npm

```sh
$ npm install
```

3.  Zip the lambda

```sh
$ zip -r ../http-signatures.zip *
```

4.  Upload zipped lambda function to AWS Lambdas via the AWS console

## Usage

```sh
$ curl -v 'https://<ID>.lambda-url.<REGION>.on.aws/' \
-H 'content-type: application/json' \
-d '{ "keyId": "<KEY_ID>", "base64Key": "<BASE64_ENCODED_Ed25519_PRIVATE_KEY>", "request":{"headers":{"host": "happy-life-bank-backend"}, "method": "GET", "url":"https://example.com"} }'
```

or

```sh
curl -v 'https://<ID>.lambda-url.<REGION>.on.aws/' \
-H 'content-type: application/json' \
-d '{ "keyId": "<KEY_ID>", "base64Key": "<BASE64_ENCODED_Ed25519_PRIVATE_KEY>", "request":{"headers":{"host": "happy-life-bank-backend"}, "method": "POST", "url":"https://example.com", "body": "{\"hello\": \"world\"}"}}'
```
