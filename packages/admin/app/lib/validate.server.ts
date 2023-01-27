import { isValidIlpAddress } from 'ilp-packet'

// TODO: Rather use a type guard. There might be a built in type guard for strings
export function validateString(
  input: FormDataEntryValue,
  fieldName: string,
  required = true
) {
  if (!required && !input) {
    return
  } else if (!input) {
    return `The ${fieldName} is required`
  } else if (typeof input !== 'string') {
    return `Expected the ${fieldName} to be a string`
  }
}

export function validateId(input: FormDataEntryValue, fieldName: string) {
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

export function validateIlpAddress(input: FormDataEntryValue, required = true) {
  if (!required && !input) {
    return
  } else if (!input) {
    return 'The static ILP address is required'
  } else if (!isValidIlpAddress(input)) {
    return 'Invalid ILP address'
  }
}

export function validatePositiveInt(
  input: FormDataEntryValue,
  fieldName: string,
  required = true,
  canBeZero = true
) {
  if (!required && !input) {
    return
  } else if (!input) {
    return `The ${fieldName} is required`
  }

  let num: bigint
  try {
    num = BigInt(input as string)
  } catch {
    return `Expected the ${fieldName} to be a positive integer`
  }
  if (num < 0) {
    return `Expected the ${fieldName} to be a positive integer`
  }
  if (!canBeZero && num === BigInt(0)) {
    return 'Field cannot have a value of zero'
  }
}
