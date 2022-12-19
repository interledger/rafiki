import { v4 } from 'uuid'

export const SIGNATURE_METHOD = 'GET'
export const SIGNATURE_TARGET_URI = '/test'

export const TEST_CLIENT = {
  id: v4(),
  name: 'Test Client',
  email: 'bob@bob.com',
  image: 'a link to an image',
  uri: 'https://example.com'
}

export const TEST_CLIENT_DISPLAY = {
  name: TEST_CLIENT.name,
  uri: TEST_CLIENT.uri
}
