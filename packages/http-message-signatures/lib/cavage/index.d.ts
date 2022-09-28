import { Component, HeaderExtractionOptions, Parameters, RequestLike, ResponseLike, SignOptions } from '../types';
export declare const defaultSigningComponents: Component[];
export declare function extractHeader({ headers }: RequestLike | ResponseLike, header: string, opts?: HeaderExtractionOptions): string;
export declare function extractComponent(message: RequestLike | ResponseLike, component: string): string;
export declare function buildSignedData(request: RequestLike, components: Component[], params: Parameters): string;
export declare function buildSignatureInputString(componentNames: Component[], parameters: Parameters): string;
export declare function sign(request: RequestLike, opts: SignOptions): Promise<RequestLike>;
