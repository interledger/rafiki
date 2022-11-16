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
          actions: ['create', 'read', 'list', 'complete'],
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
          actions: ['create', 'read', 'list', 'complete'],
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
        },
        {
          id: v4(),
          type: 'incoming-payment',
          actions: ['create', 'read', 'list'],
          grantId: '295a5695-998a-4167-b50a-a6ae774d0bfd',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: v4(),
          type: 'outgoing-payment',
          actions: ['create', 'read', 'list'],
          grantId: '295a5695-998a-4167-b50a-a6ae774d0bfd',
          createdAt: new Date(),
          updatedAt: new Date(),
          limits:
            '{"receiver":"Shoe Shop","receiveAmount":{"value":"74990000000","assetCode":"USD","assetScale":1000000000},"sendAmount":{"value":"76780000000","assetCode":"EUR","assetScale":1000000000}}'
        },
        {
          id: v4(),
          type: 'quote',
          actions: ['create', 'read'],
          grantId: '295a5695-998a-4167-b50a-a6ae774d0bfd',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    })
}
