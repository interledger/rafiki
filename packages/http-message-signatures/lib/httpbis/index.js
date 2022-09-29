'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.verify = exports.sign = exports.buildSignedData = exports.parseSignatures = exports.buildSignatureInputString = exports.extractComponent = exports.extractHeader = exports.defaultSigningComponents = void 0;
const url_1 = require('url');
const structured_headers_1 = require('structured-headers');
const algorithm_1 = require('../algorithm');
exports.defaultSigningComponents = [
    '@method',
    '@path',
    '@query',
    '@authority',
    'content-type',
    'digest',
    'content-digest',
];
function extractHeader({ headers }, header, opts) {
    var _a, _b;
    const lcHeader = header.toLowerCase();
    const key = Object.keys(headers).find((name) => name.toLowerCase() === lcHeader);
    const allowMissing = (_a = opts === null || opts === void 0 ? void 0 : opts.allowMissing) !== null && _a !== void 0 ? _a : true;
    if (!allowMissing && !key) {
        throw new Error(`Unable to extract header "${header}" from message`);
    }
    let val = key ? (_b = headers[key]) !== null && _b !== void 0 ? _b : '' : '';
    if (Array.isArray(val)) {
        val = val.join(', ');
    }
    return val.toString().replace(/\s+/g, ' ');
}
exports.extractHeader = extractHeader;
function populateDefaultParameters(parameters) {
    return {
        created: new Date(),
        ...parameters,
    };
}
// see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-06#section-2.3
function extractComponent(message, component) {
    switch (component) {
        case '@method':
            return message.method.toUpperCase();
        case '@target-uri':
            return message.url;
        case '@authority': {
            const url = new url_1.URL(message.url);
            const port = url.port ? parseInt(url.port, 10) : null;
            return `${url.host}${port && ![80, 443].includes(port) ? `:${port}` : ''}`;
        }
        case '@scheme': {
            const { protocol } = new url_1.URL(message.url);
            return protocol.slice(0, -1);
        }
        case '@request-target': {
            const { pathname, search } = new url_1.URL(message.url);
            return `${pathname}${search}`;
        }
        case '@path': {
            const { pathname } = new url_1.URL(message.url);
            return pathname;
        }
        case '@query': {
            const { search } = new url_1.URL(message.url);
            return search;
        }
        case '@status':
            if (!message.status) {
                throw new Error(`${component} is only valid for responses`);
            }
            return message.status.toString();
        case '@query-params':
        case '@request-response':
            throw new Error(`${component} is not implemented yet`);
        default:
            throw new Error(`Unknown specialty component ${component}`);
    }
}
exports.extractComponent = extractComponent;
// @todo - The current API assumes that the components have no parameters. 
// This will need an overload in future to be non-breaking and accept components with parameters 
// that can be used for request/response binding
function buildSignatureInputString(componentNames, parameters) {
    const components = componentNames.map((name) => {
        return [name.toLowerCase(), new Map()];
    });
    const params = new Map();
    Object.entries(parameters).forEach(([key, value]) => {
        if (value instanceof Date) {
            params.set(key, Math.floor(value.getTime() / 1000));
        }
        else if (typeof value === 'number') {
            params.set(key, value);
        }
        else {
            params.set(key, `${value}`);
        }
    });
    return (0, structured_headers_1.serializeInnerList)([components, params]);
}
exports.buildSignatureInputString = buildSignatureInputString;
function parseSignatures(message, opts) {
    const returnValue = new Map();
    const signatureHeader = extractHeader(message, 'Signature', opts);
    const signatureParams = extractHeader(message, 'Signature-Input', opts);
    const signatureDictionary = (0, structured_headers_1.parseDictionary)(signatureHeader);
    const signatureInputDictionary = (0, structured_headers_1.parseDictionary)(signatureParams);
    // Return an empty set if there are no signatures
    if (signatureDictionary.size === 0) {
        return returnValue;
    }
    // Extract signatures
    const signatures = new Map();
    signatureDictionary.forEach(([signature], signatureName) => {
        //Expect values to be a Byte Sequence which is returned by the parser as a BareItem
        if (Array.isArray(signature) || !(0, structured_headers_1.isByteSequence)(signature)) {
            throw new Error(`Error parsing signature value for signature '${signatureName}'. Expected a Byte Sequence.`);
        }
        if (!signatureInputDictionary.has(signatureName)) {
            throw new Error(`Error parsing signature '${signatureName}'. No corresponding signature input.`);
        }
        signatures.set(signatureName, Buffer.from(signature.base64Value, 'base64'));
    });
    signatureInputDictionary.forEach(([components, parameters], signatureName) => {
        const value = signatures.get(signatureName);
        if (!value) {
            throw new Error(`Error parsing signature input for '${signatureName}'. No corresponding signature.`);
        }
        // Expect components to be an Inner List + parameters which is returned from the parser as Item[]
        if (!Array.isArray(components)) {
            throw new Error(`Error parsing signature input for signature '${signatureName}'. Expected an Inner List.`);
        }
        const knownParameters = {};
        const dateValue = (value, key) => {
            if (typeof value !== 'number') {
                throw new Error(`Error parsing signature input parameter '${key}'. Expected an integer but got '${value}' with typeof ${typeof value}.`);
            }
            const val = new Date(value * 1000);
            if (!val || val.toString() === 'Invalid Date') {
                throw new Error(`Error converting signature input parameter '${key}' to a timestamp from '${value}'.`);
            }
            return val;
        };
        const algorithmValue = (value, key) => {
            if (typeof value === 'string' && (0, algorithm_1.isAlgorithm)(value)) {
                return value;
            }
            throw new Error(`Error signature input parameter '${key}'. '${value}' is not a known algorithm.`);
        };
        parameters.forEach((value, key) => {
            switch (key) {
                case 'created':
                    knownParameters.created = dateValue(value, key);
                    break;
                case 'expires':
                    knownParameters.expires = dateValue(value, key);
                    break;
                case 'nonce':
                    knownParameters.nonce = `${value.toString()}`;
                    break;
                case 'keyid':
                    knownParameters.keyid = `${value.toString()}`;
                    break;
                case 'alg':
                    knownParameters.alg = algorithmValue(value, key);
                    break;
            }
        });
        returnValue.set(signatureName, {
            input: {
                components,
                parameters,
            },
            value,
            components: components.map(([component, params], i) => {
                // @todo - params may be used to indicate that the componenet 
                // comes from the request when doing request/response binding
                // See: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-11#section-2.3
                if (params.size > 0) {
                    throw new Error('Component parameters are not yet supported');
                }
                if (typeof component !== 'string') {
                    throw new Error(`Error parsing component at index '${i}'. Expected a string but got a ${typeof component}.`);
                }
                return component;
            }),
            signatureParams,
            ...knownParameters,
        });
    });
    return returnValue;
}
exports.parseSignatures = parseSignatures;
function buildSignedData(request, components, signatureInputString) {
    const parts = components.map((component) => {
        let value;
        if (component.startsWith('@')) {
            value = extractComponent(request, component);
        }
        else {
            value = extractHeader(request, component);
        }
        return `"${component.toLowerCase()}": ${value}`;
    });
    parts.push(`"@signature-params": ${signatureInputString}`);
    return parts.join('\n');
}
exports.buildSignedData = buildSignedData;
// @todo - should be possible to sign responses too
async function sign(request, opts) {
    var _a;
    const signingComponents = (_a = opts.components) !== null && _a !== void 0 ? _a : exports.defaultSigningComponents;
    const signingParams = populateDefaultParameters({
        ...opts.parameters,
        keyid: opts.keyId,
        alg: opts.signer.alg,
    });
    const signatureInputString = buildSignatureInputString(signingComponents, signingParams);
    const dataToSign = buildSignedData(request, signingComponents, signatureInputString);
    const signature = await opts.signer(Buffer.from(dataToSign));
    Object.assign(request.headers, {
        'Signature': `sig1=:${signature.toString('base64')}:`,
        'Signature-Input': `sig1=${signatureInputString}`,
    });
    return request;
}
exports.sign = sign;
async function verify(request, opts) {
    const signatures = parseSignatures(request);
    signatures.forEach(({ value, components, signatureParams, keyid, alg }, signatureName) => {
        if (!keyid) {
            return false;
        }
        const verifier = opts.verifiers[keyid];
        if (!verifier || verifier.alg !== alg) {
            return false;
        }
        const data = Buffer.from(buildSignedData(request, components || [], signatureParams));
        return verifier(data, value);
    });
    return (await Promise.all(Object.entries(signatures).map(([signatureName, { components, parameters, raw }]) => {
    }))).every(result => result);
}
exports.verify = verify;
//# sourceMappingURL=index.js.map