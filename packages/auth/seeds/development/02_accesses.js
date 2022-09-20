// eslint-disable-next-line @typescript-eslint/no-var-requires
const { v4 } = require('uuid')

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('accesses')
    .del()
    .then(function () {
      // Inserts seed entries
      return knex('accesses').insert([
        {
          id: v4(),
          type: 'incoming-payment',
          actions: ['create', 'read', 'list'],
          grantId: '051208da-f6b6-4ed0-b49b-8b00439003bc',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'outgoing-payment',
          actions: ['create', 'read', 'list'],
          identifier: 'https://backend/accounts/gfranklin',
          grantId: '051208da-f6b6-4ed0-b49b-8b00439003bc',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'quote',
          actions: ['create', 'read'],
          grantId: '051208da-f6b6-4ed0-b49b-8b00439003bc',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'incoming-payment',
          actions: ['create', 'read', 'list'],
          grantId: '3afc74b3-ea28-4d7d-a21a-97742c40cdee',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'outgoing-payment',
          actions: ['create', 'read', 'list'],
          grantId: '3afc74b3-ea28-4d7d-a21a-97742c40cdee',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'quote',
          actions: ['create', 'read'],
          grantId: '3afc74b3-ea28-4d7d-a21a-97742c40cdee',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
