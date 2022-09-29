'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createVerifier = exports.createSigner = exports.isAlgorithm = void 0;
const crypto_1 = require('crypto');
const constants_1 = require('constants');
function isAlgorithm(alg) {
    switch (alg) {
        case 'rsa-v1_5-sha256':
        case 'ecdsa-p256-sha256':
        case 'hmac-sha256':
        case 'rsa-pss-sha512':
        case 'ed25519':
            return true;
        default:
            return false;
    }
}
exports.isAlgorithm = isAlgorithm;
function isEd25519PrivateKey(key) {
    const keyObj = (typeof key === 'object' && 'key' in key) ? key.key : key;
    return (typeof keyObj === 'object' && 'asymmetricKeyType' in keyObj && keyObj.asymmetricKeyType === 'ed25519');
}
function createSigner(alg, key) {
    let signer;
    switch (alg) {
        case 'hmac-sha256':
            signer = async (data) => (0, crypto_1.createHmac)('sha256', key).update(data).digest();
            break;
        case 'rsa-pss-sha512':
            signer = async (data) => (0, crypto_1.createSign)('sha512').update(data).sign({
                key,
                padding: constants_1.RSA_PKCS1_PSS_PADDING,
            });
            break;
        case 'rsa-v1_5-sha256':
            signer = async (data) => (0, crypto_1.createSign)('sha256').update(data).sign({
                key,
                padding: constants_1.RSA_PKCS1_PADDING,
            });
            break;
        case 'ecdsa-p256-sha256':
            signer = async (data) => (0, crypto_1.createSign)('sha256').update(data).sign(key);
            break;
        case 'ed25519':
            if (!isEd25519PrivateKey(key)) {
                throw new Error('Invalid key for ed25519 signer.');
            }
            signer = async (data) => {
                async (data) => {
                    return (0, crypto_1.sign)('ed25519', typeof data === 'string' ? Buffer.from(data) : data, key);
                };
            };
        default:
            throw new Error(`Unsupported signing algorithm ${alg}`);
    }
    return Object.assign(signer, { alg });
}
exports.createSigner = createSigner;
function createVerifier(alg, key) {
    let verifier;
    switch (alg) {
        case 'hmac-sha256':
            verifier = async (data, signature) => {
                const expected = (0, crypto_1.createHmac)('sha256', key).update(data).digest();
                const sig = Buffer.from(signature);
                return sig.length === expected.length && (0, crypto_1.timingSafeEqual)(sig, expected);
            };
            break;
        case 'rsa-pss-sha512':
            verifier = async (data, signature) => (0, crypto_1.createVerify)('sha512').update(data).verify({
                key,
                padding: constants_1.RSA_PKCS1_PSS_PADDING,
            }, Buffer.from(signature));
            break;
        case 'rsa-v1_5-sha256':
            verifier = async (data, signature) => (0, crypto_1.createVerify)('sha256').update(data).verify({
                key,
                padding: constants_1.RSA_PKCS1_PADDING,
            }, Buffer.from(signature));
            break;
        case 'ecdsa-p256-sha256':
            verifier = async (data, signature) => (0, crypto_1.createVerify)('sha256').update(data).verify(key, Buffer.from(signature));
            break;
        default:
            throw new Error(`Unsupported signing algorithm ${alg}`);
    }
    return Object.assign(verifier, { alg });
}
exports.createVerifier = createVerifier;
//# sourceMappingURL=index.js.map