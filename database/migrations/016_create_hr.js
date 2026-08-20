/**
 * Migration 016: Crear tablas de Recursos Humanos
 * - employees: Ficha de empleados
 * - attendance: Control de asistencia (clock in/out)
 * - shifts_schedule: Planificación de turnos
 * - payroll: Nómina
 * - leave_requests: Permisos y vacaciones
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('employees', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
      table.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('first_name', 255).notNullable();
      table.string('last_name', 255).notNullable();
      table.string('document_type', 20).defaultTo('CC');
      table.string('document_number', 50).nullable();
      table.string('phone', 50).nullable();
      table.string('email', 255).nullable();
      table.text('address').nullable();
      table.string('city', 100).nullable();
      table.date('hire_date').nullable();
      table.string('contract_type', 50).defaultTo('indefinido'); // indefinido, fijo, obra_labor, prestacion_servicios
      table.string('position', 100).nullable();
      table.decimal('base_salary', 12, 2).defaultTo(0);
      table.decimal('commission_rate', 5, 4).defaultTo(0); // % de comisión sobre ventas
      table.string('emergency_contact', 255).nullable();
      table.string('emergency_phone', 50).nullable();
      table.text('photo_url').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id'], 'idx_employees_business');
      table.index(['user_id'], 'idx_employees_user');
    })
    .createTable('attendance', (table) => {
      table.increments('id').primary();
      table.integer('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.timestamp('clock_in', { useTz: true }).notNullable();
      table.timestamp('clock_out', { useTz: true }).nullable();
      table.decimal('total_hours', 5, 2).nullable();
      table.integer('break_minutes').defaultTo(0);
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['employee_id', 'clock_in'], 'idx_attendance_employee');
    })
    .createTable('shifts_schedule', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.uuid('branch_id').notNullable().references('id').inTable('branches').onDelete('CASCADE');
      table.integer('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
      table.date('shift_date').notNullable();
      table.time('start_time').notNullable();
      table.time('end_time').notNullable();
      table.string('shift_type', 30).defaultTo('regular'); // regular, extra, festivo
      table.text('notes').nullable();
      table.index(['employee_id', 'shift_date'], 'idx_shifts_schedule_employee');
    })
    .createTable('payroll', (table) => {
      table.increments('id').primary();
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.integer('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
      table.date('period_start').notNullable();
      table.date('period_end').notNullable();
      table.decimal('base_salary', 12, 2).notNullable();
      table.decimal('overtime_hours', 5, 2).defaultTo(0);
      table.decimal('overtime_amount', 12, 2).defaultTo(0);
      table.decimal('bonuses', 12, 2).defaultTo(0);
      table.decimal('commissions', 12, 2).defaultTo(0);
      table.decimal('deductions', 12, 2).defaultTo(0);
      table.decimal('health_deduction', 12, 2).defaultTo(0);
      table.decimal('pension_deduction', 12, 2).defaultTo(0);
      table.decimal('net_pay', 12, 2).notNullable();
      table.string('status', 20).defaultTo('borrador'); // borrador, aprobada, pagada
      table.timestamp('paid_at', { useTz: true }).nullable();
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['business_id', 'employee_id'], 'idx_payroll_employee');
    })
    .createTable('leave_requests', (table) => {
      table.increments('id').primary();
      table.integer('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
      table.uuid('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
      table.string('leave_type', 30).notNullable(); // vacaciones, permiso, incapacidad, licencia
      table.date('start_date').notNullable();
      table.date('end_date').notNullable();
      table.integer('total_days').notNullable();
      table.string('status', 20).defaultTo('pendiente'); // pendiente, aprobada, rechazada
      table.integer('approved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.index(['employee_id'], 'idx_leave_requests_employee');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('leave_requests')
    .dropTableIfExists('payroll')
    .dropTableIfExists('shifts_schedule')
    .dropTableIfExists('attendance')
    .dropTableIfExists('employees');
};
