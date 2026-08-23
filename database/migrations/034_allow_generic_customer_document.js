/**
 * Migration 034: Permitir clientes sin documento o con documento genérico de Consumidor Final (222222222222)
 * - Convierte documentos genéricos o vacíos existentes a NULL
 * - Elimina la restricción única estricta de (business_id, document_number)
 * - Crea un índice único parcial que solo aplica a documentos reales no vacíos
 */
exports.up = async function(knex) {
  // 1. Limpiar clientes existentes que contengan '222222222222', '22222222', etc. o vacíos a NULL
  try {
    await knex.raw(`
      UPDATE customers 
      SET document_number = NULL 
      WHERE document_number IS NOT NULL 
        AND (
          TRIM(document_number) = '' 
          OR document_number ~ '^2{6,}$' 
          OR LOWER(TRIM(document_number)) = 'consumidor final'
          OR document_number = '222222222222'
          OR document_number = '22222222'
        );
    `);
  } catch (e) {
    console.log('Nota al limpiar documentos genéricos de clientes:', e.message);
  }

  // 2. Eliminar la restricción única existente si está definida como UNIQUE constraint
  try {
    await knex.raw('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_business_id_document_number_unique;');
  } catch (e) {
    console.log('Nota: customers_business_id_document_number_unique no existe o ya fue removida');
  }

  // 3. Crear índice único parcial: Solo valida unicidad para documentos reales (no nulos, no vacíos y no 222222222222)
  try {
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_doc_unique 
      ON customers (business_id, document_number) 
      WHERE document_number IS NOT NULL 
        AND TRIM(document_number) != '' 
        AND document_number NOT IN ('222222222222', '22222222', '222222222', '2222222222');
    `);
  } catch (e) {
    console.log('Nota: idx_customers_business_doc_unique ya existe o no se pudo crear:', e.message);
  }
};

exports.down = async function(knex) {
  try {
    await knex.raw('DROP INDEX IF EXISTS idx_customers_business_doc_unique;');
  } catch (e) {}

  try {
    await knex.raw('ALTER TABLE customers ADD CONSTRAINT customers_business_id_document_number_unique UNIQUE (business_id, document_number);');
  } catch (e) {}
};
