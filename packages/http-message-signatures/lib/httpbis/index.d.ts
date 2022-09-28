import { Component, HeaderExtractionOptions, Parameters, RequestLike, ResponseLike, SignOptions, VerifyOptions, ParsedSignature } from '../types';
export declare const defaultSigningComponents: Component[];
export declare function extractHeader({ headers }: RequestLike | ResponseLike, header: string, opts?: HeaderExtractionOptions): string;
export declare function extractComponent(message: RequestLike | ResponseLike, component: string): string;
export declare function buildSignatureInputString(componentNames: Component[], parameters: Parameters): string;
export declare function parseSignatures(message: RequestLike | ResponseLike, opts?: HeaderExtractionOptions): Map<string, ParsedSignature>;
export declare function buildSignedData(request: RequestLike, components: Component[], signatureInputString: string): string;
export declare function sign(request: RequestLike, opts: SignOptions): Promise<RequestLike>;
export declare function verify(request: RequestLike, opts: VerifyOptions): Promise<boolean>;
