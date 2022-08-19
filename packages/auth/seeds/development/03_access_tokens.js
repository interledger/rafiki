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
        }
      ])
    })
}
