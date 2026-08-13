// Knex Configuration File — Multi-tenant POS System
// Soporta desarrollo local y producción (VPS con PostgreSQL)
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'pos_db',
          user: process.env.DB_USER || 'pos_user',
          password: process.env.DB_PASSWORD || 'pos_secure_2024',
        },
    pool: {
      min: 2,
      max: 10,
      afterCreate: (conn, done) => {
        conn.query('SET timezone = "America/Bogota";', (err) => {
          done(err, conn);
        });
      }
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    },
    searchPath: ['public']
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'pos_db',
          user: process.env.DB_USER || 'pos_user',
          password: process.env.DB_PASSWORD || 'pos_secure_2024',
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        },
    pool: {
      min: 2,
      max: 20,
      afterCreate: (conn, done) => {
        conn.query('SET timezone = "America/Bogota";', (err) => {
          done(err, conn);
        });
      }
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    },
    searchPath: ['public']
  }
};
