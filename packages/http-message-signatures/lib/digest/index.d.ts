/// <reference types="node" />
import { DigestAlgorithm, RequestLike } from '../types';
export declare function createContentDigestHeader(body: string | Buffer | undefined, algorithms: DigestAlgorithm[]): string;
export declare function verifyContentDigest(request: RequestLike): boolean;
