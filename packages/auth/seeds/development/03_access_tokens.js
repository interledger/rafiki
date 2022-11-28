// eslint-disable-next-line @typescript-eslint/no-var-requires
const { v4 } = require('uuid')

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('accessTokens')
    .del()
    .then(function () {
      // Inserts seed entries
      return knex('accessTokens').insert([
        {
          id: v4(),
          value: 'example-access-token',
          managementId: v4(),
          expiresIn: 100000000,
          grantId: '051208da-f6b6-4ed0-b49b-8b00439003bc',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          value: 'local-bank-access-token',
          managementId: v4(),
          expiresIn: 100000000,
          grantId: '3afc74b3-ea28-4d7d-a21a-97742c40cdee',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          value: 'demo-access-token',
          managementId: v4(),
          expiresIn: 100000000,
          grantId: '295a5695-998a-4167-b50a-a6ae774d0bfd',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
