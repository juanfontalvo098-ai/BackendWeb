/**
 * Migration 023: Agregar soporte para pago por día laborado (jornal) y por horas
 * - employees: salary_type ('diario' | 'mensual' | 'por_horas'), daily_rate, hourly_rate
 * - payroll: days_worked, daily_rate, payment_type ('diario' | 'semanal' | 'quincenal' | 'mensual')
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('employees', (table) => {
    table.string('salary_type', 30).defaultTo('diario'); // 'diario', 'mensual', 'por_horas'
    table.decimal('daily_rate', 12, 2).defaultTo(0); // Valor por día laborado
    table.decimal('hourly_rate', 12, 2).defaultTo(0); // Valor por hora
  });

  await knex.schema.alterTable('payroll', (table) => {
    table.decimal('days_worked', 5, 2).defaultTo(1);
    table.decimal('daily_rate', 12, 2).defaultTo(0);
    table.string('payment_type', 30).defaultTo('diario'); // 'diario', 'semanal', 'quincenal', 'mensual'
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('payroll', (table) => {
    table.dropColumn('payment_type');
    table.dropColumn('daily_rate');
    table.dropColumn('days_worked');
  });

  await knex.schema.alterTable('employees', (table) => {
    table.dropColumn('hourly_rate');
    table.dropColumn('daily_rate');
    table.dropColumn('salary_type');
  });
};
