// Update with your config settings.

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      // The database, user and password here match those in the localenv/docker-compose.yml file
      database: 'auth',
      user: 'postgres',
      password: 'password'
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

  peerdevelopment: {
    client: 'postgresql',
    connection: {
      // The database, user and password here match those in the localenv/peer-docker-compose.yml file
      database: 'peerauth',
      user: 'postgres',
      password: 'password'
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
    connection: process.env.AUTH_DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    }
  }
}
