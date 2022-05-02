// Update with your config settings.

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      database: 'auth_development',
      user: 'postgres',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    }
  },

  testing: {
    client: 'postgresql',
    connection: {
      database: 'auth_testing',
      user: 'postgres',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      database: 'my_auth_db',
      user: 'username',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    }
  }
}
