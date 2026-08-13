// Módulo de conexión a SQLite usando sql.js (WebAssembly)
// Provee una API compatible con better-sqlite3 para que los controladores
// no necesiten ningún cambio.
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(process.env.DB_PATH || './database/pos.db');

// Clase wrapper que emula la API de better-sqlite3 usando sql.js
class DatabaseWrapper {
  constructor() {
    this._db = null;
    this._ready = false;
    this._savePending = false;
    this._debounceTimer = null;
    this._closed = false;
  }

  // Inicialización asíncrona — se debe llamar antes de usar la DB
  async initialize() {
    const SQL = await initSqlJs();

    // Si ya existe el archivo de la base de datos, cargarlo
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this._db = new SQL.Database(buffer);
      console.log(`Base de datos cargada desde: ${dbPath}`);
    } else {
      // Crear directorio si no existe
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._db = new SQL.Database();
      console.log('Nueva base de datos creada en memoria.');
    }

    // Habilitar llaves foráneas (WAL no aplica en sql.js)
    this._db.run('PRAGMA foreign_keys = ON');
    this._ready = true;

    // Guardar automáticamente cada 15 segundos como safety net
    this._saveInterval = setInterval(() => this._saveToDiskImmediate(), 15000);

    // Graceful shutdown: guardar al cerrar el proceso
    this._setupGracefulShutdown();

    return this;
  }

  // Configurar cierre limpio del proceso
  _setupGracefulShutdown() {
    const shutdown = (signal) => {
      console.log(`\n🛑 Señal ${signal} recibida. Guardando base de datos...`);
      this._saveToDiskImmediate();
      console.log('✅ Base de datos guardada exitosamente. Cerrando...');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('beforeExit', () => {
      this._saveToDiskImmediate();
    });
  }

  // Guardar la base de datos al disco inmediatamente
  _saveToDiskImmediate() {
    if (!this._db || this._closed) return;
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      console.error('Error guardando base de datos:', err.message);
    }
  }

  // Guardar con debounce (100ms) — agrupa escrituras rápidas consecutivas
  _saveToDisk() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._savePending = true;
    this._debounceTimer = setTimeout(() => {
      this._saveToDiskImmediate();
      this._savePending = false;
      this._debounceTimer = null;
    }, 100);
  }

  // Ejecutar SQL sin retorno (CREATE TABLE, múltiples sentencias, etc.)
  exec(sql) {
    this._db.run(sql);
    this._saveToDisk();
  }

  // Emular db.pragma() — ejecuta PRAGMA y retorna resultado
  pragma(pragmaStr) {
    try {
      const result = this._db.exec(`PRAGMA ${pragmaStr}`);
      if (result.length > 0) {
        return result[0].values[0][0];
      }
    } catch (e) {
      // Algunos pragmas como WAL no funcionan en sql.js, ignorar silenciosamente
    }
    return null;
  }

  // Emular db.prepare(sql) — retorna un objeto Statement compatible
  prepare(sql) {
    return new StatementWrapper(this, sql);
  }

  // Emular db.transaction(fn) — retorna una función que ejecuta dentro de BEGIN/COMMIT
  transaction(fn) {
    const self = this;
    return function (...args) {
      self._db.run('BEGIN TRANSACTION');
      try {
        const result = fn.apply(this, args);
        self._db.run('COMMIT');
        self._saveToDisk();
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  // Cerrar la base de datos y guardar
  close() {
    if (this._closed) return;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    if (this._saveInterval) clearInterval(this._saveInterval);
    this._saveToDiskImmediate();
    this._closed = true;
    if (this._db) this._db.close();
  }
}

// Wrapper de Statement que emula la API de better-sqlite3
class StatementWrapper {
  constructor(dbWrapper, sql) {
    this._dbWrapper = dbWrapper;
    this._sql = sql;
  }

  // Retorna una sola fila como objeto (o undefined si no hay resultados)
  get(...params) {
    try {
      const stmt = this._dbWrapper._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);

      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => row[col] = values[i]);
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    } catch (err) {
      throw err;
    }
  }

  // Retorna todas las filas como array de objetos
  all(...params) {
    try {
      const results = [];
      const stmt = this._dbWrapper._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);

      while (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => row[col] = values[i]);
        results.push(row);
      }
      stmt.free();
      return results;
    } catch (err) {
      throw err;
    }
  }

  // Ejecuta INSERT/UPDATE/DELETE y retorna { changes, lastInsertRowid }
  run(...params) {
    try {
      if (params.length > 0) {
        this._dbWrapper._db.run(this._sql, params);
      } else {
        this._dbWrapper._db.run(this._sql);
      }

      // Obtener lastInsertRowid y changes
      const lastIdResult = this._dbWrapper._db.exec('SELECT last_insert_rowid() as id');
      const changesResult = this._dbWrapper._db.exec('SELECT changes() as c');

      const lastInsertRowid = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : 0;
      const changes = changesResult.length > 0 ? changesResult[0].values[0][0] : 0;

      // Persistir cambios a disco después de cada escritura
      this._dbWrapper._saveToDisk();

      return { changes, lastInsertRowid };
    } catch (err) {
      throw err;
    }
  }
}

// Crear instancia singleton
const db = new DatabaseWrapper();

// Exportar la instancia (se debe inicializar antes de usar)
module.exports = db;
