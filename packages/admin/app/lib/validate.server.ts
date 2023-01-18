import { isValidIlpAddress } from 'ilp-packet'

export function validateString(input: any, fieldName: string, required = true) {
  if (!required && !input) {
    return
  } else if (!input) {
    return `The ${fieldName} is required`
  } else if (typeof input !== 'string') {
    return `Expected the ${fieldName} to be a string`
  }
}

export function validateUrl(input: any, fieldName: string, required = true) {
  if (!required && !input) {
    return
  } else if (!input) {
    return `The ${fieldName} is required`
  } else if (typeof input !== 'string') {
    return `Expected the ${fieldName} to be a string`
  }
  // TODO: use regex here to check URL
}

export function validateId(input: any, fieldName: string) {
  if (!input) {
    return `The ${fieldName} is required`
  } else if (typeof input !== 'string') {
    return `Expected the ${fieldName} to be a string`
  }
  // Regular expression to check if string is a valid UUID
  const regexExp =
    /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/

  if (!regexExp.test(input)) {
    return `Requires a valid ${fieldName}`
  }
}

export function validateIlpAddress(input: any, required = true) {
  if (!required && !input) {
    return
  } else if (!input) {
    return 'The static ILP address is required'
  } else if (!isValidIlpAddress(input)) {
    return 'Invalid ILP address'
  }
}

export function validatePositiveInt(
  input: any,
  fieldName: string,
  required = true,
  canBeZero = true
) {
  if (!required && !input) {
    return
  } else if (!input) {
    return `The ${fieldName} is required`
  }
  const num = parseInt(input as string, 10)
  const isNan = isNaN(num)
  const isInt = num.toString() === (input as string)
  const isNegative = num < 0
  if (isNan || !isInt || isNegative) {
    return `Expected the ${fieldName} to be a positive integer`
  }
  if (!canBeZero && num === 0) {
    return 'Field cannot have a value of zero'
  }
}
