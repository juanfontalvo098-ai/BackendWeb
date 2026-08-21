const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dbConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PRIVATE_URL;

if (!dbConnectionString && !process.env.DB_HOST && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
  console.error('\n====================================================================');
  console.error('⚠️ ALERTA DE CONFIGURACIÓN DE BASE DE DATOS EN DESPLIEGUE:');
  console.error('La variable de entorno DATABASE_URL no está configurada en la plataforma.');
  console.error('Knex intentará usar "localhost:5432" por defecto, lo que causará:');
  console.error('-> Error: connect ECONNREFUSED 127.0.0.1:5432');
  console.error('Por favor agrega DATABASE_URL en las variables de entorno de tu servidor.');
  console.error('====================================================================\n');
}

const getSslConfig = () => {
  if (process.env.DB_SSL === 'false') return false;
  // Por defecto en Neon, Render, Supabase, Railway se requiere SSL
  return { rejectUnauthorized: false };
};

const getConnectionConfig = () => {
  if (dbConnectionString) {
    return {
      connectionString: dbConnectionString,
      ssl: getSslConfig()
    };
  }

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'pos_db',
    user: process.env.DB_USER || 'pos_user',
    password: process.env.DB_PASSWORD || 'pos_secure_2024',
    ssl: process.env.DB_SSL === 'true' ? getSslConfig() : false
  };
};

module.exports = {
  development: {
    client: 'pg',
    connection: getConnectionConfig(),
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
      directory: path.join(__dirname, 'database', 'migrations'),
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: path.join(__dirname, 'database', 'seeds')
    },
    searchPath: ['public']
  },

  production: {
    client: 'pg',
    connection: getConnectionConfig(),
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
      directory: path.join(__dirname, 'database', 'migrations'),
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: path.join(__dirname, 'database', 'seeds')
    },
    searchPath: ['public']
  }
};

