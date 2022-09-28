"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sign = exports.buildSignatureInputString = exports.buildSignedData = exports.extractComponent = exports.extractHeader = exports.defaultSigningComponents = void 0;
const url_1 = require("url");
exports.defaultSigningComponents = [
    '@request-target',
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
// see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-06#section-2.3
function extractComponent(message, component) {
    switch (component) {
        case '@request-target': {
            const { pathname, search } = new url_1.URL(message.url);
            return `${message.method.toLowerCase()} ${pathname}${search}`;
        }
        default:
            throw new Error(`Unknown specialty component ${component}`);
    }
}
exports.extractComponent = extractComponent;
const ALG_MAP = {
    'rsa-v1_5-sha256': 'rsa-sha256',
};
function buildSignedData(request, components, params) {
    const payloadParts = {};
    const paramNames = Object.keys(params);
    if (components.includes('@request-target')) {
        Object.assign(payloadParts, {
            '(request-target)': extractComponent(request, '@request-target'),
        });
    }
    if (paramNames.includes('created')) {
        Object.assign(payloadParts, {
            '(created)': params.created,
        });
    }
    if (paramNames.includes('expires')) {
        Object.assign(payloadParts, {
            '(expires)': params.expires,
        });
    }
    components.forEach((name) => {
        if (!name.startsWith('@')) {
            Object.assign(payloadParts, {
                [name.toLowerCase()]: extractHeader(request, name),
            });
        }
    });
    return Object.entries(payloadParts).map(([name, value]) => {
        if (value instanceof Date) {
            return `${name}: ${Math.floor(value.getTime() / 1000)}`;
        }
        else {
            return `${name}: ${value.toString()}`;
        }
    }).join('\n');
}
exports.buildSignedData = buildSignedData;
function buildSignatureInputString(componentNames, parameters) {
    const params = Object.entries(parameters).reduce((normalised, [name, value]) => {
        var _a;
        switch (name.toLowerCase()) {
            case 'keyid':
                return Object.assign(normalised, {
                    keyId: value,
                });
            case 'alg':
                return Object.assign(normalised, {
                    algorithm: (_a = ALG_MAP[value]) !== null && _a !== void 0 ? _a : value,
                });
            default:
                return Object.assign(normalised, {
                    [name]: value,
                });
        }
    }, {});
    const headers = [];
    const paramNames = Object.keys(params);
    if (componentNames.includes('@request-target')) {
        headers.push('(request-target)');
    }
    if (paramNames.includes('created')) {
        headers.push('(created)');
    }
    if (paramNames.includes('expires')) {
        headers.push('(expires)');
    }
    componentNames.forEach((name) => {
        if (!name.startsWith('@')) {
            headers.push(name.toLowerCase());
        }
    });
    return `${Object.entries(params).map(([name, value]) => {
        if (typeof value === 'number') {
            return `${name}=${value}`;
        }
        else if (value instanceof Date) {
            return `${name}=${Math.floor(value.getTime() / 1000)}`;
        }
        else {
            return `${name}="${value.toString()}"`;
        }
    }).join(',')},headers="${headers.join(' ')}"`;
}
exports.buildSignatureInputString = buildSignatureInputString;
// @todo - should be possible to sign responses too
async function sign(request, opts) {
    var _a;
    const signingComponents = (_a = opts.components) !== null && _a !== void 0 ? _a : exports.defaultSigningComponents;
    const signingParams = {
        ...opts.parameters,
        keyid: opts.keyId,
        alg: opts.signer.alg,
    };
    const signatureInputString = buildSignatureInputString(signingComponents, signingParams);
    const dataToSign = buildSignedData(request, signingComponents, signingParams);
    const signature = await opts.signer(Buffer.from(dataToSign));
    Object.assign(request.headers, {
        Signature: `${signatureInputString},signature="${signature.toString('base64')}"`,
    });
    return request;
}
exports.sign = sign;
//# sourceMappingURL=index.js.map