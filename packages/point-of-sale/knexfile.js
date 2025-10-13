// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      database: 'pos',
      user: 'postgres',
      password: 'password'
    }
  },

  testing: {
    client: 'postgresql',
    connection: {
      database: 'pos_testing',
      user: 'postgres',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'pos_knex_migrations'
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.POS_DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'pos_knex_migrations'
    }
  }
}
