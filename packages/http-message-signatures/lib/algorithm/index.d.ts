/// <reference types="node" />
/// <reference types="node" />
import { BinaryLike, KeyLike, SignKeyObjectInput, SignPrivateKeyInput, VerifyKeyObjectInput, VerifyPublicKeyInput } from 'crypto';
export declare type Algorithm = 'rsa-v1_5-sha256' | 'ecdsa-p256-sha256' | 'hmac-sha256' | 'rsa-pss-sha512' | 'ed25519';
export declare function isAlgorithm(alg: string): alg is Algorithm;
export interface Signer {
    (data: BinaryLike): Promise<Buffer>;
    alg: Algorithm;
}
export interface Verifier {
    (data: BinaryLike, signature: BinaryLike): Promise<boolean>;
    alg: Algorithm;
    keyid?: string;
}
export declare function createSigner(alg: Algorithm, key: BinaryLike | KeyLike | SignKeyObjectInput | SignPrivateKeyInput): Signer;
export declare function createVerifier(alg: Algorithm, key: BinaryLike | KeyLike | VerifyKeyObjectInput | VerifyPublicKeyInput): Verifier;
