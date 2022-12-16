exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('grants')
    .del()
    .then(function () {
      // Inserts seed entries
      return knex('grants').insert([
        {
          id: '051208da-f6b6-4ed0-b49b-8b00439003bc',
          state: 'granted',
          startMethod: ['redirect'],
          finishMethod: 'redirect',
          finishUri: 'https://example.com/finish',
          client: 'https://backend/accounts/gfranklin',
          clientKeyId: 'keyid-742ab7cd-1624-4d2e-af6e-e15a71638669',
          clientNonce: 'example-client-nonce',
          continueToken: '566a929a-86bb-41b8-b12d-718fa4ab2db2',
          continueId: '92c98ab7-9240-43b4-a86f-402f1c6fd6f5',
          interactId: 'example-interact-id',
          interactRef: 'exmaple-interact-ref',
          interactNonce: 'example-interact-nonce',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '3afc74b3-ea28-4d7d-a21a-97742c40cdee',
          state: 'granted',
          startMethod: ['redirect'],
          finishMethod: 'redirect',
          finishUri: 'http://peer-auth:3006/finish',
          client: 'https://peer-backend/accounts/pfry',
          clientKeyId: 'keyid-97a3a431-8ee1-48fc-ac85-70e2f5eba8e5',
          clientNonce: 'example-client-nonce',
          continueToken: 'fc7d255b-66f7-46f5-af56-65831a110604',
          continueId: '006856cd-a34a-4d4a-bb69-af1e07980834',
          interactId: 'local-bank-interact-id',
          interactRef: 'local-bank-interact-ref',
          interactNonce: 'local-bank-interact-nonce',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '295a5695-998a-4167-b50a-a6ae774d0bfd',
          state: 'granted',
          startMethod: ['redirect'],
          finishMethod: 'redirect',
          finishUri: 'http://localhost:3300/mock-idp/fake-client?',
          client: 'https://backend/accounts/gfranklin',
          clientKeyId: 'keyid-742ab7cd-1624-4d2e-af6e-e15a71638669',
          clientNonce: 'demo-client-nonce',
          continueToken: '301294e4-db8d-445b-b77e-d27583719ecc',
          continueId: 'edbe6928-7d80-44a8-94b8-514e75759439',
          interactId: 'demo-interact-id',
          interactRef: 'demo-interact-ref',
          interactNonce: 'demo-interact-nonce',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
