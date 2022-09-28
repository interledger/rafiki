import { RequestLike } from '../../src';
import { buildSignatureInputString, buildSignedData } from '../../src/cavage';
import { expect } from 'chai';

describe('cavage', () => {
    describe('.buildSignatureInputString', () => {
        describe('specification tests', () => {
            it('creates an input string', () => {
                const inputString = buildSignatureInputString(['@request-target', 'Host', 'Date', 'Digest', 'Content-Length'], {
                    keyid: 'rsa-key-1',
                    alg: 'hs2019',
                    created: new Date(1402170695000),
                    expires: new Date(1402170995000),
                });
                expect(inputString).to.equal('keyId="rsa-key-1",algorithm="hs2019",' +
                    'created=1402170695,expires=1402170995,' +
                    'headers="(request-target) (created) (expires) host date digest content-length"')
            });
        });
    });
    describe('.buildSignedData', () => {
        describe('specification examples', () => {
            const testRequest: RequestLike = {
                method: 'GET',
                url: 'https://example.org/foo',
                headers: {
                    'Host': 'example.org',
                    'Date': 'Tue, 07 Jun 2014 20:51:35 GMT',
                    'X-Example': 'Example header\n    with some whitespace.',
                    'X-EmptyHeader': '',
                    'Cache-Control': ['max-age=60', 'must-revalidate'],
                },
            };
            it('builds the signed data payload', () => {
                const payload = buildSignedData(testRequest, [
                    '@request-target',
                    'host',
                    'date',
                    'cache-control',
                    'x-emptyheader',
                    'x-example',
                ], {
                    created: new Date(1402170695000),
                });
                expect(payload).to.equal('(request-target): get /foo\n' +
                    '(created): 1402170695\n' +
                    'host: example.org\n' +
                    'date: Tue, 07 Jun 2014 20:51:35 GMT\n' +
                    'cache-control: max-age=60, must-revalidate\n' +
                    'x-emptyheader: \n' +
                    'x-example: Example header with some whitespace.');
            });
        });
    })
});
