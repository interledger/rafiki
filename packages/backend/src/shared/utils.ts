import { validate, version } from 'uuid'

export function validateId(id: string): boolean {
  return validate(id) && version(id) === 4
}
