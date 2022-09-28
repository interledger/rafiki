import { generateKeyPair, sign, verify } from 'crypto';
import { promisify } from 'util';
import { createSigner, createVerifier } from '../../src';
import { expect } from 'chai';
import { readFile } from 'fs';
import { join } from 'path';

describe('ecdsa-p256-sha256', () => {
    describe('internal tests', () => {
        let ecdsaKeyPair: { publicKey: string, privateKey: string };
        before('generate key pair', async () => {
            ecdsaKeyPair = await promisify(generateKeyPair)('ec', {
                namedCurve: 'P-256',
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                },
            });
        });
        describe('signing', () => {
            it('signs a payload', async () => {
                const signer = createSigner('ecdsa-p256-sha256', ecdsaKeyPair.privateKey);
                const data = 'some random data';
                const sig = await signer(data);
                expect(signer.alg).to.equal('ecdsa-p256-sha256');
                expect(sig).to.satisfy((arg: Buffer) => verify('sha256', Buffer.from(data), ecdsaKeyPair.publicKey, arg));
            });
        });
        describe('verifying', () => {
            it('verifies a signature', async () => {
                const verifier = createVerifier('ecdsa-p256-sha256', ecdsaKeyPair.publicKey);
                const data = 'some random data';
                const sig = sign('sha512', Buffer.from(data), ecdsaKeyPair.privateKey);
                expect(verifier.alg).to.equal('ecdsa-p256-sha256');
                expect(sig).to.satisfy((arg: Buffer) => verifier(data, arg));
            });
        });
    });
    describe('specification examples', () => {
        let ecKeyPem: string;
        before('load rsa key', async () => {
            ecKeyPem = (await promisify(readFile)(join(__dirname, '../etc/ecdsa-p256.pem'))).toString();
        });
        describe('response signing', () => {
            const data = '"content-type": application/json\n' +
                '"digest": SHA-256=X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=\n' +
                '"content-length": 18\n' +
                '"@signature-params": ("content-type" "digest" "content-length");created=1618884475;keyid="test-key-ecc-p256"';
            it('successfully signs a payload', async () => {
                const sig = await (createSigner('ecdsa-p256-sha256', ecKeyPem)(data));
                expect(sig).to.satisfy((arg: Buffer) => verify('sha256', Buffer.from(data), ecKeyPem, arg));
            });
            // seems to be broken in node - Error: error:0D07209B:asn1 encoding routines:ASN1_get_object:too long
            // could be to do with https://stackoverflow.com/a/39575576
            it.skip('successfully verifies a signature', async () => {
                const sig = Buffer.from('n8RKXkj0iseWDmC6PNSQ1GX2R9650v+lhbb6rTGoSrSSx18zmn6fPOtBx48/WffYLO0n1RHHf9scvNGAgGq52Q==', 'base64');
                expect(sig).to.satisfy((arg: Buffer) => verify('sha256', Buffer.from(data), ecKeyPem, arg));
                expect(await (createVerifier('ecdsa-p256-sha256', ecKeyPem)(data, sig))).to.equal(true);
            });
        });
    });
});
