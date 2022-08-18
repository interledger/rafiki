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
          clientKeyId: 'http://mock-auth:1337/keys/1234',
          interactId: 'example-interact-id',
          interactRef: 'exmaple-interact-ref',
          interactNonce: 'example-interact-nonce',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
