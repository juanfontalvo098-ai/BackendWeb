// database/knex.js — Instancia singleton de Knex (PostgreSQL)
// Reemplaza al antiguo connection.js basado en SQLite/sql.js
const knexConfig = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

if (!config) {
  throw new Error(`No se encontró configuración de Knex para el entorno: ${environment}`);
}

const knex = require('knex')(config);

// Verificar conexión al iniciar
knex.raw('SELECT 1')
  .then(() => {
    console.log('✅ Conexión a PostgreSQL establecida correctamente.');
  })
  .catch((err) => {
    console.error('❌ Error al conectar con PostgreSQL:', err.message);
    console.error('   Verifica que PostgreSQL esté corriendo y las credenciales en .env sean correctas.');
  });

module.exports = knex;
