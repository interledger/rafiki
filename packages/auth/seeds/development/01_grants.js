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
          clientNonce: 'example-client-nonce',
          clientKeyId: 'http://fynbos/keys/1234',
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
          clientNonce: 'example-client-nonce',
          clientKeyId: 'http://local-bank/keys/1234',
          interactId: 'local-bank-interact-id',
          interactRef: 'local-bank-interact-ref',
          interactNonce: 'local-bank-interact-nonce',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
