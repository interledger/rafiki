import { parseItem } from "../dist";

const expect = require('chai').expect;
const { isByteSequence } = require('../dist');

describe('.isByteSequence', () => {

    it('returns true for a valid Byte Sequence', () => {
        const base64Value = `:${Buffer.from('TEST VALUE').toString('base64')}:`
        const [item] = parseItem(base64Value)
        expect(isByteSequence(item)).to.be.true
    })

    it('returns false for a number', () => {
        const [item] = parseItem("98736459873465")
        expect(isByteSequence(item)).to.be.false
    })

    it('returns false for a string', () => {
        const [item] = parseItem('"TEST VALUE"')
        expect(isByteSequence(item)).to.be.false
    })

    it('returns false for a JS object', () => {
        expect(isByteSequence({})).to.be.false
    })

});
