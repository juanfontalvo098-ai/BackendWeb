// database/knex.js — Instancia singleton de Knex (PostgreSQL)
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
    if (err.message.includes('ECONNREFUSED 127.0.0.1') || err.message.includes('ECONNREFUSED localhost')) {
      console.error('\n🔍 CAUSA PROBABLE DEL ERROR DE DESPLIEGUE:');
      console.error('El servidor está intentando conectarse a 127.0.0.1:5432 porque no encontró la variable DATABASE_URL.');
      console.error('👉 Solución: Entra al panel de control de tu plataforma de deploy (Render, Railway, VPS, etc.)');
      console.error('   y agrega la variable de entorno:');
      console.error('   DATABASE_URL = postgresql://usuario:password@host_servidor:5432/nombre_bd?sslmode=require\n');
    } else {
      console.error('   Verifica que PostgreSQL esté activo y las credenciales en la variable de entorno DATABASE_URL sean válidas.');
    }
  });

module.exports = knex;

