import { IocContract } from '@adonisjs/fold'
import axios from 'axios'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { TestContainer, createTestApp } from '../../tests/app'

describe('Rafiki Graphql', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('graphql endpoint not exposed on /api/graphql', async (): Promise<void> => {
    const introspection = axios.post(
      `http://localhost:${appContainer.adminPort}/api/graphql`,
      {
        json: {
          query: `
          query {
            __schema {
              queryType {
                fields {
                  name
                }
              }
            }
          }
        `
        }
      }
    )
    await expect(introspection).rejects.toThrow(
      'Request failed with status code 404'
    )
  })
})
