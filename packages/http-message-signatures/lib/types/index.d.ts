/// <reference types="node" />
import { Parameters as StructuredDataParameters, Item as StructuredDataItem } from 'structured-headers';
import { Algorithm, Signer, Verifier } from '../algorithm';
declare type HttpLike = {
    method: string;
    url: string;
    headers: Record<string, {
        toString(): string;
    } | string | string[] | undefined>;
};
export declare type RequestLike = HttpLike;
export declare type ResponseLike = HttpLike & {
    status: number;
};
export declare type Parameter = 'created' | 'expires' | 'nonce' | 'alg' | 'keyid' | string;
export declare type Component = '@method' | '@target-uri' | '@authority' | '@scheme' | '@request-target' | '@path' | '@query' | '@query-params' | string;
export declare type ResponseComponent = '@status' | '@request-response' | Component;
export declare type Parameters = {
    [name: Parameter]: string | number | Date | {
        [Symbol.toStringTag]: () => string;
    };
};
export declare type DigestAlgorithm = 'sha-256' | 'sha-512';
declare type CommonOptions = {
    format: 'httpbis' | 'cavage';
};
export declare type ParsedSignature = {
    input: {
        components: StructuredDataItem[];
        parameters: StructuredDataParameters;
    };
    value: Buffer;
    components: Component[];
    signatureParams: string;
    alg?: Algorithm;
    created?: Date;
    expires?: Date;
    keyid?: string;
    nonce?: string;
};
export declare type SignOptions = CommonOptions & {
    components?: Component[];
    parameters?: Parameters;
    allowMissingHeaders?: boolean;
    keyId: string;
    contentDigests?: DigestAlgorithm[];
    signer: Signer;
};
export declare type VerifyOptions = CommonOptions & {
    verifiers: {
        [keyid: string]: Verifier;
    };
};
export declare type HeaderExtractionOptions = {
    allowMissing: boolean;
};
export {};
