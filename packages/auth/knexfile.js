// Update with your config settings.

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      // The database, user and password here match those in the rafiki-docker-compose.yml file
      database: 'auth',
      user: 'auth',
      password: 'auth'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    },
    seeds: {
      directory: './seeds/development'
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
