/**
 * HR Controller — Multi-tenant
 * Empleados, asistencia (clock in/out), turnos, nómina, pagos diarios/jornales, permisos
 * Integración automática con Contabilidad & Finanzas (Asientos en Libro Diario, P&L y Balance)
 */
const knex = require('../database/knex');

// ==================== HELPER: INTEGRACIÓN CONTABLE ====================

/**
 * Registra o actualiza el asiento contable en el Libro Diario para un pago o liquidación de nómina/jornal.
 * Cuenta Débito: 5.1.02 Gastos de Personal / Nómina (o cuenta de gasto)
 * Cuenta Crédito: 1.1.01 Caja General (o Bancos / Nómina por Pagar)
 */
async function syncPayrollToAccounting(businessId, branchId, payrollEntry, userId = null) {
  try {
    const emp = await knex('employees').where('id', payrollEntry.employee_id).first();
    const empName = emp ? `${emp.first_name} ${emp.last_name}` : `Empleado #${payrollEntry.employee_id}`;

    // 1. Obtener o crear cuenta de Gasto de Personal (5.1.02)
    let expenseAccount = await knex('chart_of_accounts')
      .where({ business_id: businessId })
      .where(function() {
        this.where('code', '5.1.02')
          .orWhere('name', 'ilike', '%nómina%')
          .orWhere('name', 'ilike', '%personal%');
      })
      .first();

    if (!expenseAccount) {
      expenseAccount = await knex('chart_of_accounts')
        .where({ business_id: businessId, account_type: 'gasto' })
        .first();
    }

    // 2. Obtener o crear cuenta de Caja General / Bancos (1.1.01)
    let cashAccount = await knex('chart_of_accounts')
      .where({ business_id: businessId })
      .where(function() {
        this.where('code', '1.1.01')
          .orWhere('code', '1.1.02')
          .orWhere('name', 'ilike', '%caja%');
      })
      .first();

    if (!cashAccount) {
      cashAccount = await knex('chart_of_accounts')
        .where({ business_id: businessId, account_type: 'activo' })
        .first();
    }

    if (!expenseAccount || !cashAccount) {
      console.warn('No se encontraron cuentas contables configuradas para la empresa:', businessId);
      return null;
    }

    const isPaid = payrollEntry.status === 'pagada';
    const amount = parseFloat(payrollEntry.net_pay || payrollEntry.base_salary || 0);
    if (amount <= 0) return null;

    const entryNumber = `AST-NOM-${String(payrollEntry.id).padStart(5, '0')}`;
    const entryDate = payrollEntry.paid_at
      ? new Date(payrollEntry.paid_at).toISOString().slice(0, 10)
      : (payrollEntry.period_end ? new Date(payrollEntry.period_end).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

    const description = `Pago Nómina / Jornal #${payrollEntry.id} - ${empName} (${payrollEntry.days_worked || 1} día(s) laborado(s) - ${payrollEntry.payment_type || 'diario'})`;

    // Buscar si ya existe el asiento contable
    const existingEntry = await knex('journal_entries')
      .where({ business_id: businessId, reference_type: 'payroll', reference_id: payrollEntry.id })
      .first();

    // Obtener un usuario válido para auditoría
    let validUserId = userId;
    if (!validUserId) {
      const defaultUser = await knex('users').where({ business_id: businessId }).first();
      validUserId = defaultUser ? defaultUser.id : 1;
    }

    let entryId;
    if (existingEntry) {
      await knex('journal_entries').where({ id: existingEntry.id }).update({
        entry_date: entryDate,
        description,
        status: isPaid ? 'aprobado' : 'borrador'
      });
      entryId = existingEntry.id;
      // Eliminar líneas anteriores
      await knex('journal_entry_lines').where({ journal_entry_id: entryId }).del();
    } else {
      const [newEntry] = await knex('journal_entries').insert({
        business_id: businessId,
        branch_id: branchId || null,
        entry_number: entryNumber,
        entry_date: entryDate,
        description,
        reference_type: 'payroll',
        reference_id: payrollEntry.id,
        status: isPaid ? 'aprobado' : 'borrador',
        user_id: validUserId
      }).returning('*');
      entryId = newEntry.id;
    }

    // Línea 1: Débito al gasto de personal / nómina
    await knex('journal_entry_lines').insert({
      journal_entry_id: entryId,
      account_id: expenseAccount.id,
      debit: amount,
      credit: 0,
      description: `Gasto por nómina / jornal: ${empName}`
    });

    // Línea 2: Crédito a caja general / bancos
    await knex('journal_entry_lines').insert({
      journal_entry_id: entryId,
      account_id: cashAccount.id,
      debit: 0,
      credit: amount,
      description: `Egreso de caja por pago de nómina: ${empName}`
    });

    return entryId;
  } catch (err) {
    console.error('Error al sincronizar nómina a contabilidad:', err);
    return null;
  }
}

// ==================== EMPLEADOS ====================

exports.getAllEmployees = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { search, is_active } = req.query;

    let query = knex('employees as e')
      .leftJoin('branches as b', 'e.branch_id', 'b.id')
      .leftJoin('users as u', 'e.user_id', 'u.id')
      .select(
        'e.*',
        'b.name as branch_name',
        'u.username',
        'u.role as user_role'
      )
      .where('e.business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere(function() {
        this.where('e.branch_id', branchId).orWhereNull('e.branch_id');
      });
    }

    if (search) {
      query.andWhere(function() {
        this.where('e.first_name', 'ilike', `%${search}%`)
          .orWhere('e.last_name', 'ilike', `%${search}%`)
          .orWhere('e.document_number', 'ilike', `%${search}%`)
          .orWhere('e.position', 'ilike', `%${search}%`);
      });
    }
    if (is_active !== undefined) query.andWhere('e.is_active', is_active === 'true');

    const employees = await query.orderBy('e.id', 'asc');

    const indexed = employees.map((emp, index) => ({
      ...emp,
      business_relative_id: index + 1,
      base_salary: parseFloat(emp.base_salary || 0),
      daily_rate: parseFloat(emp.daily_rate || 0),
      hourly_rate: parseFloat(emp.hourly_rate || 0),
      commission_rate: parseFloat(emp.commission_rate || 0)
    }));

    res.json(indexed);
  } catch (err) {
    console.error('Error al obtener empleados:', err);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const employee = await knex('employees as e')
      .leftJoin('branches as b', 'e.branch_id', 'b.id')
      .leftJoin('users as u', 'e.user_id', 'u.id')
      .select('e.*', 'b.name as branch_name', 'u.username', 'u.role as user_role')
      .where({ 'e.id': req.params.id, 'e.business_id': businessId })
      .first();

    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    res.json({
      ...employee,
      base_salary: parseFloat(employee.base_salary || 0),
      daily_rate: parseFloat(employee.daily_rate || 0),
      hourly_rate: parseFloat(employee.hourly_rate || 0),
      commission_rate: parseFloat(employee.commission_rate || 0)
    });
  } catch (err) {
    console.error('Error al obtener empleado:', err);
    res.status(500).json({ error: 'Error al obtener empleado' });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const data = req.body;

    if (!data.first_name || !data.first_name.trim()) {
      return res.status(400).json({ error: 'El nombre del empleado es requerido' });
    }

    const targetBranchId = data.branch_id || branchId || null;
    const parsedUserId = data.user_id ? parseInt(data.user_id, 10) : null;
    const dailyRate = parseFloat(data.daily_rate) || 0;
    const baseSalary = parseFloat(data.base_salary) || (dailyRate > 0 ? dailyRate * 30 : 0);
    const calculatedDaily = dailyRate > 0 ? dailyRate : (baseSalary > 0 ? baseSalary / 30 : 0);

    const [employee] = await knex('employees').insert({
      business_id: businessId,
      branch_id: targetBranchId,
      user_id: isNaN(parsedUserId) ? null : parsedUserId,
      first_name: data.first_name.trim(),
      last_name: (data.last_name || '').trim(),
      document_type: data.document_type || 'CC',
      document_number: data.document_number || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      hire_date: data.hire_date || null,
      contract_type: data.contract_type || 'indefinido',
      salary_type: data.salary_type || (dailyRate > 0 ? 'diario' : 'mensual'),
      daily_rate: calculatedDaily,
      hourly_rate: parseFloat(data.hourly_rate) || (calculatedDaily > 0 ? calculatedDaily / 8 : 0),
      position: data.position || 'Colaborador',
      base_salary: baseSalary,
      commission_rate: parseFloat(data.commission_rate) || 0,
      emergency_contact: data.emergency_contact || null,
      emergency_phone: data.emergency_phone || null,
      photo_url: data.photo_url || null,
      is_active: true
    }).returning('*');

    res.status(201).json(employee);
  } catch (err) {
    console.error('Error al crear empleado:', err);
    res.status(500).json({ error: 'Error al crear empleado: ' + err.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const data = req.body;

    const existing = await knex('employees').where({ id, business_id: businessId }).first();
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });

    const updateData = { updated_at: knex.fn.now() };
    const fields = [
      'first_name', 'last_name', 'document_type', 'document_number', 'phone', 'email',
      'address', 'city', 'hire_date', 'contract_type', 'salary_type', 'position',
      'emergency_contact', 'emergency_phone', 'photo_url', 'branch_id', 'is_active'
    ];

    fields.forEach(f => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });

    if (data.user_id !== undefined) {
      updateData.user_id = data.user_id ? parseInt(data.user_id, 10) : null;
    }
    if (data.daily_rate !== undefined) updateData.daily_rate = parseFloat(data.daily_rate) || 0;
    if (data.hourly_rate !== undefined) updateData.hourly_rate = parseFloat(data.hourly_rate) || 0;
    if (data.base_salary !== undefined) updateData.base_salary = parseFloat(data.base_salary) || 0;
    if (data.commission_rate !== undefined) updateData.commission_rate = parseFloat(data.commission_rate) || 0;

    const [updated] = await knex('employees').where({ id, business_id: businessId }).update(updateData).returning('*');
    res.json(updated);
  } catch (err) {
    console.error('Error al actualizar empleado:', err);
    res.status(500).json({ error: 'Error al actualizar empleado: ' + err.message });
  }
};

exports.removeEmployee = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    await knex('employees').where({ id, business_id: businessId }).update({ is_active: false });
    res.json({ message: 'Empleado desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar empleado:', err);
    res.status(500).json({ error: 'Error al desactivar empleado' });
  }
};

// ==================== ASISTENCIA ====================

exports.clockIn = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { employee_id, notes } = req.body;

    if (!employee_id) return res.status(400).json({ error: 'ID de empleado es requerido' });

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    const openRecord = await knex('attendance')
      .where({ employee_id, business_id: businessId })
      .whereNull('clock_out')
      .first();

    if (openRecord) {
      return res.status(400).json({ error: 'El empleado ya tiene una entrada registrada sin marcar salida' });
    }

    const [record] = await knex('attendance').insert({
      employee_id,
      business_id: businessId,
      branch_id: targetBranchId,
      clock_in: knex.fn.now(),
      notes: notes || null
    }).returning('*');

    res.status(201).json({ message: 'Entrada registrada exitosamente', record });
  } catch (err) {
    console.error('Error al registrar entrada:', err);
    res.status(500).json({ error: 'Error al registrar entrada' });
  }
};

exports.clockOut = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { employee_id, break_minutes, notes } = req.body;

    if (!employee_id) return res.status(400).json({ error: 'ID de empleado es requerido' });

    const openRecord = await knex('attendance')
      .where({ employee_id, business_id: businessId })
      .whereNull('clock_out')
      .orderBy('clock_in', 'desc')
      .first();

    if (!openRecord) {
      return res.status(400).json({ error: 'No hay un turno abierto para este empleado' });
    }

    const clockInTime = new Date(openRecord.clock_in);
    const clockOutTime = new Date();
    const breakMin = parseInt(break_minutes, 10) || 0;
    const totalHours = Math.max(0, ((clockOutTime - clockInTime) / (1000 * 60 * 60)) - (breakMin / 60));

    const [updated] = await knex('attendance')
      .where({ id: openRecord.id })
      .update({
        clock_out: clockOutTime,
        total_hours: parseFloat(totalHours.toFixed(2)),
        break_minutes: breakMin,
        notes: notes !== undefined ? notes : openRecord.notes
      }).returning('*');

    res.json({ message: 'Salida registrada exitosamente', record: updated });
  } catch (err) {
    console.error('Error al registrar salida:', err);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { date_from, date_to, employee_id } = req.query;

    let query = knex('attendance as a')
      .join('employees as e', 'a.employee_id', 'e.id')
      .select('a.*', knex.raw("e.first_name || ' ' || e.last_name as employee_name"), 'e.position')
      .where('a.business_id', businessId);

    if (employee_id) query.andWhere('a.employee_id', employee_id);
    if (date_from) query.andWhere('a.clock_in', '>=', date_from);
    if (date_to) query.andWhere('a.clock_in', '<=', date_to + ' 23:59:59');

    const records = await query.orderBy('a.clock_in', 'desc').limit(100);
    res.json(records);
  } catch (err) {
    console.error('Error al obtener asistencia:', err);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
};

// ==================== TURNOS & PLANIFICACIÓN ====================

exports.getSchedule = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { date_from, date_to, employee_id } = req.query;

    let query = knex('shifts_schedule as s')
      .join('employees as e', 's.employee_id', 'e.id')
      .select('s.*', knex.raw("e.first_name || ' ' || e.last_name as employee_name"), 'e.position')
      .where('s.business_id', businessId);

    if (employee_id) query.andWhere('s.employee_id', employee_id);
    if (date_from) query.andWhere('s.shift_date', '>=', date_from);
    if (date_to) query.andWhere('s.shift_date', '<=', date_to);

    const shifts = await query.orderBy('s.shift_date').orderBy('s.start_time');
    res.json(shifts);
  } catch (err) {
    console.error('Error al obtener turnos:', err);
    res.status(500).json({ error: 'Error al obtener turnos' });
  }
};

exports.createShift = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { employee_id, shift_date, start_time, end_time, shift_type, notes } = req.body;

    if (!employee_id || !shift_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Empleado, fecha y horario son requeridos' });
    }

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await knex('branches').where('business_id', businessId).first();
      targetBranchId = defaultBranch?.id;
    }

    const [shift] = await knex('shifts_schedule').insert({
      business_id: businessId,
      branch_id: targetBranchId,
      employee_id,
      shift_date,
      start_time,
      end_time,
      shift_type: shift_type || 'regular',
      notes: notes || null
    }).returning('*');

    res.status(201).json(shift);
  } catch (err) {
    console.error('Error al programar turno:', err);
    res.status(500).json({ error: 'Error al programar turno' });
  }
};

exports.deleteShift = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('shifts_schedule').where({ id: req.params.id, business_id: businessId }).del();
    res.json({ message: 'Turno eliminado' });
  } catch (err) {
    console.error('Error al eliminar turno:', err);
    res.status(500).json({ error: 'Error al eliminar turno' });
  }
};

// ==================== NÓMINA & LIQUIDACIÓN POR DÍA / PERÍODO ====================

exports.getPayroll = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { period_start, period_end, status } = req.query;

    let query = knex('payroll as p')
      .join('employees as e', 'p.employee_id', 'e.id')
      .select(
        'p.*',
        knex.raw("e.first_name || ' ' || e.last_name as employee_name"),
        'e.position',
        'e.salary_type',
        'e.document_number'
      )
      .where('p.business_id', businessId);

    if (period_start && period_end) {
      query.whereBetween('p.period_start', [period_start, period_end]);
    }
    if (status) query.andWhere('p.status', status);

    const payroll = await query.orderBy('p.id', 'desc');

    const formatted = payroll.map(p => ({
      ...p,
      base_salary: parseFloat(p.base_salary || 0),
      daily_rate: parseFloat(p.daily_rate || 0),
      days_worked: parseFloat(p.days_worked || 1),
      overtime_amount: parseFloat(p.overtime_amount || 0),
      bonuses: parseFloat(p.bonuses || 0),
      commissions: parseFloat(p.commissions || 0),
      deductions: parseFloat(p.deductions || 0),
      health_deduction: parseFloat(p.health_deduction || 0),
      pension_deduction: parseFloat(p.pension_deduction || 0),
      net_pay: parseFloat(p.net_pay || 0)
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error al obtener nómina:', err);
    res.status(500).json({ error: 'Error al obtener registros de pago y nómina' });
  }
};

// Liquidación / Pago individual o rápido por días laborados (Jornales)
exports.liquidateEmployee = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id;
    const {
      employee_id,
      period_start,
      period_end,
      days_worked,
      daily_rate,
      payment_type,
      bonuses,
      deductions,
      mark_as_paid,
      notes
    } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'ID de empleado es requerido' });
    }

    const emp = await knex('employees').where({ id: employee_id, business_id: businessId }).first();
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const pType = payment_type || (emp.salary_type === 'diario' ? 'diario' : 'mensual');
    const days = parseFloat(days_worked) > 0 ? parseFloat(days_worked) : 1;
    const dRate = parseFloat(daily_rate) > 0 ? parseFloat(daily_rate) : (parseFloat(emp.daily_rate) > 0 ? parseFloat(emp.daily_rate) : parseFloat(emp.base_salary) / 30);
    
    // Cálculo base
    const baseTotal = pType === 'diario' || pType === 'semanal' ? (days * dRate) : parseFloat(emp.base_salary || 0);

    // Comisiones
    let commissions = 0;
    if (parseFloat(emp.commission_rate) > 0 && emp.user_id) {
      const pStart = period_start || new Date().toISOString().slice(0, 10);
      const pEnd = period_end || pStart;
      const salesData = await knex('invoices')
        .join('orders', 'invoices.order_id', 'orders.id')
        .where('orders.user_id', emp.user_id)
        .whereRaw('DATE(invoices.created_at) BETWEEN ? AND ?', [pStart, pEnd])
        .select(knex.raw('COALESCE(SUM(invoices.total), 0) as total_sales'))
        .first();
      commissions = parseFloat(salesData?.total_sales || 0) * parseFloat(emp.commission_rate);
    }

    const bonusVal = parseFloat(bonuses) || 0;
    const deductVal = parseFloat(deductions) || 0;

    let healthDeduction = 0;
    let pensionDeduction = 0;
    if (pType === 'mensual' || pType === 'quincenal') {
      healthDeduction = baseTotal * 0.04;
      pensionDeduction = baseTotal * 0.04;
    }

    const totalDeductions = deductVal + healthDeduction + pensionDeduction;
    const netPay = Math.max(0, baseTotal + bonusVal + commissions - totalDeductions);

    const isPaid = mark_as_paid !== false;

    const [payrollEntry] = await knex('payroll').insert({
      business_id: businessId,
      employee_id: emp.id,
      period_start: period_start || new Date().toISOString().slice(0, 10),
      period_end: period_end || period_start || new Date().toISOString().slice(0, 10),
      payment_type: pType,
      days_worked: days,
      daily_rate: dRate,
      base_salary: baseTotal,
      overtime_hours: 0,
      overtime_amount: 0,
      bonuses: bonusVal,
      commissions,
      deductions: totalDeductions,
      health_deduction: healthDeduction,
      pension_deduction: pensionDeduction,
      net_pay: netPay,
      status: isPaid ? 'pagada' : 'aprobada',
      paid_at: isPaid ? knex.fn.now() : null,
      notes: notes || `Liquidación ${pType} (${days} días laborados @ ${dRate}/día)`
    }).returning('*');

    // Sincronizar automáticamente con el Libro Diario y Contabilidad
    await syncPayrollToAccounting(businessId, branchId, payrollEntry, userId);

    res.status(201).json({
      message: `Liquidación registrada exitosamente (${isPaid ? 'Pagada y Asentada en Contabilidad' : 'Pendiente'})`,
      payroll: payrollEntry
    });
  } catch (err) {
    console.error('Error al liquidar empleado:', err);
    res.status(500).json({ error: 'Error al liquidar empleado: ' + err.message });
  }
};

exports.generatePayroll = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id;
    const { period_start, period_end, employee_ids, payment_type } = req.body;

    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'Período de inicio y fin son requeridos' });
    }

    let employeesQuery = knex('employees').where({ business_id: businessId, is_active: true });
    if (employee_ids && employee_ids.length > 0) {
      employeesQuery.whereIn('id', employee_ids);
    }
    const employees = await employeesQuery;

    const created = [];
    for (const emp of employees) {
      const isDaily = emp.salary_type === 'diario';
      const dRate = parseFloat(emp.daily_rate) > 0 ? parseFloat(emp.daily_rate) : (parseFloat(emp.base_salary) / 30 || 0);

      // Contar días asistidos o turnos en el rango
      const attendanceCount = await knex('attendance')
        .where('employee_id', emp.id)
        .whereRaw('DATE(clock_in) BETWEEN ? AND ?', [period_start, period_end])
        .count('id as count')
        .first();

      const daysWorked = isDaily ? (parseInt(attendanceCount?.count, 10) || 1) : 30;
      const baseSalary = isDaily ? (daysWorked * dRate) : parseFloat(emp.base_salary || 0);

      // Comisiones
      let commissions = 0;
      if (parseFloat(emp.commission_rate) > 0 && emp.user_id) {
        const salesData = await knex('invoices')
          .join('orders', 'invoices.order_id', 'orders.id')
          .where('orders.user_id', emp.user_id)
          .whereRaw('DATE(invoices.created_at) BETWEEN ? AND ?', [period_start, period_end])
          .select(knex.raw('COALESCE(SUM(invoices.total), 0) as total_sales'))
          .first();
        commissions = parseFloat(salesData?.total_sales || 0) * parseFloat(emp.commission_rate);
      }

      let healthDeduction = 0;
      let pensionDeduction = 0;
      if (!isDaily) {
        healthDeduction = baseSalary * 0.04;
        pensionDeduction = baseSalary * 0.04;
      }

      const totalDeductions = healthDeduction + pensionDeduction;
      const netPay = baseSalary + commissions - totalDeductions;

      const [payrollEntry] = await knex('payroll').insert({
        business_id: businessId,
        employee_id: emp.id,
        period_start,
        period_end,
        payment_type: payment_type || (isDaily ? 'diario' : 'mensual'),
        days_worked: daysWorked,
        daily_rate: dRate,
        base_salary: baseSalary,
        overtime_hours: 0,
        overtime_amount: 0,
        bonuses: 0,
        commissions,
        deductions: totalDeductions,
        health_deduction: healthDeduction,
        pension_deduction: pensionDeduction,
        net_pay: netPay,
        status: 'borrador',
        notes: isDaily ? `Liquidación por ${daysWorked} día(s) laborado(s)` : 'Nómina mensual regular'
      }).returning('*');

      await syncPayrollToAccounting(businessId, branchId, payrollEntry, userId);
      created.push(payrollEntry);
    }

    res.status(201).json({ message: `Nómina generada para ${created.length} empleados`, entries: created });
  } catch (err) {
    console.error('Error al generar nómina:', err);
    res.status(500).json({ error: 'Error al generar nómina' });
  }
};

exports.approvePayroll = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id;
    const { ids } = req.body;

    await knex('payroll')
      .where('business_id', businessId)
      .whereIn('id', ids)
      .update({ status: 'aprobada' });

    const entries = await knex('payroll').where('business_id', businessId).whereIn('id', ids);
    for (const p of entries) {
      await syncPayrollToAccounting(businessId, branchId, p, userId);
    }

    res.json({ message: 'Liquidación aprobada y actualizada en contabilidad' });
  } catch (err) {
    console.error('Error al aprobar nómina:', err);
    res.status(500).json({ error: 'Error al aprobar nómina' });
  }
};

exports.payPayroll = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id;
    const { ids } = req.body;

    await knex('payroll')
      .where('business_id', businessId)
      .whereIn('id', ids)
      .update({
        status: 'pagada',
        paid_at: knex.fn.now()
      });

    const entries = await knex('payroll').where('business_id', businessId).whereIn('id', ids);
    for (const p of entries) {
      await syncPayrollToAccounting(businessId, branchId, p, userId);
    }

    res.json({ message: 'Pago registrado y contabilizado exitosamente en Finanzas' });
  } catch (err) {
    console.error('Error al registrar pago:', err);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
};

// Sincronizar retroactivamente todos los pagos de nómina existentes con contabilidad
exports.syncAllPayrollToAccounting = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id;

    const payrollEntries = await knex('payroll').where('business_id', businessId);
    let count = 0;
    for (const p of payrollEntries) {
      const res = await syncPayrollToAccounting(businessId, branchId, p, userId);
      if (res) count++;
    }

    res.json({ message: `Se sincronizaron ${count} registros de nómina con Contabilidad y Finanzas` });
  } catch (err) {
    console.error('Error al sincronizar nómina con contabilidad:', err);
    res.status(500).json({ error: 'Error al sincronizar nómina' });
  }
};

// ==================== PERMISOS & VACACIONES ====================

exports.getLeaveRequests = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { status } = req.query;

    let query = knex('leave_requests as l')
      .join('employees as e', 'l.employee_id', 'e.id')
      .select('l.*', knex.raw("e.first_name || ' ' || e.last_name as employee_name"), 'e.position')
      .where('l.business_id', businessId);

    if (status) query.andWhere('l.status', status);

    const requests = await query.orderBy('l.start_date', 'desc');
    res.json(requests);
  } catch (err) {
    console.error('Error al obtener permisos:', err);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
};

exports.createLeaveRequest = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { employee_id, leave_type, start_date, end_date, notes } = req.body;

    if (!employee_id || !leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    const [request] = await knex('leave_requests').insert({
      business_id: businessId,
      employee_id,
      leave_type,
      start_date,
      end_date,
      total_days: totalDays,
      notes: notes || null
    }).returning('*');

    res.status(201).json(request);
  } catch (err) {
    console.error('Error al crear solicitud:', err);
    res.status(500).json({ error: 'Error al crear solicitud' });
  }
};

exports.updateLeaveStatus = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { status } = req.body;

    if (!['aprobada', 'rechazada'].includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    await knex('leave_requests')
      .where({ id, business_id: businessId })
      .update({
        status,
        approved_by: req.user.id
      });

    res.json({ message: `Solicitud ${status}` });
  } catch (err) {
    console.error('Error al actualizar permiso:', err);
    res.status(500).json({ error: 'Error al actualizar permiso' });
  }
};
