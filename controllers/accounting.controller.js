/**
 * Accounting Controller — Multi-tenant
 * Plan de cuentas, libro diario, libro mayor, balance general, P&L
 * Cuentas por cobrar y por pagar
 */
const knex = require('../database/knex');
const ExcelJS = require('exceljs');

// ==================== PLAN DE CUENTAS ====================

exports.getChartOfAccounts = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const accounts = await knex('chart_of_accounts')
      .where('business_id', businessId)
      .orderBy('code');
    res.json(accounts);
  } catch (err) {
    console.error('Error al obtener plan de cuentas:', err);
    res.status(500).json({ error: 'Error al obtener plan de cuentas' });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { code, name, account_type, parent_id } = req.body;

    if (!code || !name || !account_type) {
      return res.status(400).json({ error: 'Código, nombre y tipo son requeridos' });
    }

    const [account] = await knex('chart_of_accounts').insert({
      business_id: businessId, code, name, account_type,
      parent_id: parent_id || null
    }).returning('*');

    res.status(201).json(account);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'El código de cuenta ya existe' });
    console.error('Error al crear cuenta:', err);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { code, name, account_type, parent_id, is_active } = req.body;

    const updateData = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (account_type !== undefined) updateData.account_type = account_type;
    if (parent_id !== undefined) updateData.parent_id = parent_id || null;
    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    await knex('chart_of_accounts').where({ id, business_id: businessId }).update(updateData);
    res.json({ message: 'Cuenta actualizada' });
  } catch (err) {
    console.error('Error al actualizar cuenta:', err);
    res.status(500).json({ error: 'Error al actualizar cuenta' });
  }
};

// Inicializar plan de cuentas estándar colombiano
exports.initializeDefaultAccounts = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const existing = await knex('chart_of_accounts').where('business_id', businessId).first();
    if (existing) return res.status(400).json({ error: 'Ya existe un plan de cuentas' });

    const defaultAccounts = [
      { code: '1', name: 'ACTIVOS', account_type: 'activo' },
      { code: '1.1', name: 'Activo Corriente', account_type: 'activo', parent_code: '1' },
      { code: '1.1.01', name: 'Caja General', account_type: 'activo', parent_code: '1.1' },
      { code: '1.1.02', name: 'Bancos', account_type: 'activo', parent_code: '1.1' },
      { code: '1.1.03', name: 'Cuentas por Cobrar', account_type: 'activo', parent_code: '1.1' },
      { code: '1.1.04', name: 'Inventario de Mercancías', account_type: 'activo', parent_code: '1.1' },
      { code: '2', name: 'PASIVOS', account_type: 'pasivo' },
      { code: '2.1', name: 'Pasivo Corriente', account_type: 'pasivo', parent_code: '2' },
      { code: '2.1.01', name: 'Cuentas por Pagar Proveedores', account_type: 'pasivo', parent_code: '2.1' },
      { code: '2.1.02', name: 'IVA por Pagar', account_type: 'pasivo', parent_code: '2.1' },
      { code: '2.1.03', name: 'Retenciones por Pagar', account_type: 'pasivo', parent_code: '2.1' },
      { code: '2.1.04', name: 'Nómina por Pagar', account_type: 'pasivo', parent_code: '2.1' },
      { code: '3', name: 'PATRIMONIO', account_type: 'patrimonio' },
      { code: '3.1', name: 'Capital Social', account_type: 'patrimonio', parent_code: '3' },
      { code: '3.2', name: 'Utilidades del Ejercicio', account_type: 'patrimonio', parent_code: '3' },
      { code: '4', name: 'INGRESOS', account_type: 'ingreso' },
      { code: '4.1', name: 'Ingresos Operacionales', account_type: 'ingreso', parent_code: '4' },
      { code: '4.1.01', name: 'Ventas de Productos', account_type: 'ingreso', parent_code: '4.1' },
      { code: '4.1.02', name: 'Ingresos por Propinas', account_type: 'ingreso', parent_code: '4.1' },
      { code: '4.1.03', name: 'Ingresos por Delivery', account_type: 'ingreso', parent_code: '4.1' },
      { code: '5', name: 'GASTOS', account_type: 'gasto' },
      { code: '5.1', name: 'Gastos Operacionales', account_type: 'gasto', parent_code: '5' },
      { code: '5.1.01', name: 'Costo de Ventas', account_type: 'gasto', parent_code: '5.1' },
      { code: '5.1.02', name: 'Gastos de Personal / Nómina', account_type: 'gasto', parent_code: '5.1' },
      { code: '5.1.03', name: 'Servicios Públicos', account_type: 'gasto', parent_code: '5.1' },
      { code: '5.1.04', name: 'Arriendo', account_type: 'gasto', parent_code: '5.1' },
      { code: '5.1.05', name: 'Gastos Varios', account_type: 'gasto', parent_code: '5.1' },
      { code: '5.1.06', name: 'Mermas y Pérdidas', account_type: 'gasto', parent_code: '5.1' },
    ];

    // Insertar en dos pasos: primero sin parent_id, luego actualizar
    const accountMap = {};
    for (const acc of defaultAccounts) {
      const [created] = await knex('chart_of_accounts').insert({
        business_id: businessId, code: acc.code, name: acc.name, account_type: acc.account_type
      }).returning('*');
      accountMap[acc.code] = created.id;
    }

    // Actualizar parent_id
    for (const acc of defaultAccounts) {
      if (acc.parent_code && accountMap[acc.parent_code]) {
        await knex('chart_of_accounts')
          .where({ id: accountMap[acc.code] })
          .update({ parent_id: accountMap[acc.parent_code] });
      }
    }

    res.status(201).json({ message: 'Plan de cuentas inicializado', count: defaultAccounts.length });
  } catch (err) {
    console.error('Error al inicializar plan de cuentas:', err);
    res.status(500).json({ error: 'Error al inicializar plan de cuentas' });
  }
};

// ==================== LIBRO DIARIO ====================

exports.getJournalEntries = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate, reference_type, status } = req.query;

    let query = knex('journal_entries as je')
      .join('users as u', 'je.user_id', 'u.id')
      .select('je.*', 'u.full_name as user_name')
      .where('je.business_id', businessId);

    if (startDate && endDate) query.whereBetween('je.entry_date', [startDate, endDate]);
    if (reference_type) query.andWhere('je.reference_type', reference_type);
    if (status) query.andWhere('je.status', status);

    const entries = await query.orderBy('je.entry_date', 'desc').orderBy('je.id', 'desc');

    for (const entry of entries) {
      entry.lines = await knex('journal_entry_lines as jel')
        .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
        .select('jel.*', 'coa.code as account_code', 'coa.name as account_name')
        .where('jel.journal_entry_id', entry.id);
    }

    res.json(entries);
  } catch (err) {
    console.error('Error al obtener asientos:', err);
    res.status(500).json({ error: 'Error al obtener libro diario' });
  }
};

exports.createJournalEntry = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { entry_date, description, reference_type, reference_id, lines } = req.body;

    if (!lines || lines.length < 2) {
      return res.status(400).json({ error: 'Un asiento debe tener al menos 2 líneas' });
    }

    // Validar partida doble
    const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: `Partida doble no cuadra: Débitos=${totalDebit}, Créditos=${totalCredit}` });
    }

    const count = await knex('journal_entries').where('business_id', businessId).count('id as c').first();
    const entryNumber = `AD-${String(parseInt(count.c) + 1).padStart(6, '0')}`;

    const entryId = await knex.transaction(async (trx) => {
      const [entry] = await trx('journal_entries').insert({
        business_id: businessId, branch_id: branchId || null,
        entry_number: entryNumber,
        entry_date: entry_date || new Date().toISOString().slice(0, 10),
        description: description || null,
        reference_type: reference_type || 'manual',
        reference_id: reference_id || null,
        user_id: userId
      }).returning('*');

      for (const line of lines) {
        await trx('journal_entry_lines').insert({
          journal_entry_id: entry.id,
          account_id: line.account_id,
          debit: parseFloat(line.debit || 0),
          credit: parseFloat(line.credit || 0),
          description: line.description || null
        });
      }

      return entry.id;
    });

    res.status(201).json({ id: entryId, entry_number: entryNumber, message: 'Asiento contable creado' });
  } catch (err) {
    console.error('Error al crear asiento:', err);
    res.status(500).json({ error: 'Error al crear asiento contable' });
  }
};

exports.approveJournalEntry = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('journal_entries')
      .where({ id: req.params.id, business_id: businessId, status: 'borrador' })
      .update({ status: 'aprobado' });
    res.json({ message: 'Asiento aprobado' });
  } catch (err) {
    console.error('Error al aprobar asiento:', err);
    res.status(500).json({ error: 'Error al aprobar asiento' });
  }
};

// ==================== LIBRO MAYOR ====================

exports.getLedger = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { account_id, startDate, endDate } = req.query;

    let query = knex('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_entry_id', 'je.id')
      .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
      .select('jel.*', 'je.entry_number', 'je.entry_date', 'je.description as entry_description',
        'coa.code as account_code', 'coa.name as account_name', 'coa.account_type')
      .where('je.business_id', businessId)
      .andWhere('je.status', 'aprobado');

    if (account_id) query.andWhere('jel.account_id', parseInt(account_id));
    if (startDate && endDate) query.whereBetween('je.entry_date', [startDate, endDate]);

    const movements = await query.orderBy('je.entry_date').orderBy('je.id');
    res.json(movements);
  } catch (err) {
    console.error('Error al obtener libro mayor:', err);
    res.status(500).json({ error: 'Error al obtener libro mayor' });
  }
};

// ==================== BALANCE GENERAL & ECUACIÓN PATRIMONIAL ====================

exports.getBalanceSheet = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { asOfDate } = req.query;
    const dateFilter = asOfDate || new Date().toISOString().slice(0, 10);

    // 1. Inventario Real Valorizado de Productos Terminados
    const prodInv = await knex('inventory as i')
      .join('products as p', 'i.product_id', 'p.id')
      .where('p.business_id', businessId)
      .select(knex.raw('COALESCE(SUM(i.quantity * COALESCE(p.cost_price, p.price * 0.6, 0)), 0)::float as total_products_cost'))
      .first();

    // 2. Inventario Real Valorizado de Insumos / Materias Primas
    const supInv = await knex('supplies_inventory as si')
      .join('supplies as s', 'si.supply_id', 's.id')
      .where('s.business_id', businessId)
      .select(knex.raw('COALESCE(SUM(si.quantity * COALESCE(s.cost_price, 0)), 0)::float as total_supplies_cost'))
      .first();

    const totalInventoryValue = (prodInv?.total_products_cost || 0) + (supInv?.total_supplies_cost || 0);

    // 3. Saldos del Libro Mayor
    const journalBalances = await knex('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_entry_id', 'je.id')
      .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
      .where('je.business_id', businessId)
      .andWhere('je.status', 'aprobado')
      .andWhere('je.entry_date', '<=', dateFilter)
      .groupBy('coa.id', 'coa.code', 'coa.name', 'coa.account_type')
      .select(
        'coa.id', 'coa.code', 'coa.name', 'coa.account_type',
        knex.raw('SUM(jel.debit)::float as total_debit'),
        knex.raw('SUM(jel.credit)::float as total_credit'),
        knex.raw('(SUM(jel.debit) - SUM(jel.credit))::float as balance_activo'),
        knex.raw('(SUM(jel.credit) - SUM(jel.debit))::float as balance_pasivo_patrimonio')
      )
      .orderBy('coa.code');

    // 4. Ventas Pagadas por Medios Electrónicos / Bancos (1.1.02)
    const electronicSales = await knex('invoices')
      .where('business_id', businessId)
      .whereIn('payment_method', ['tarjeta', 'transferencia', 'nequi', 'daviplata'])
      .whereRaw('DATE(created_at) <= ?', [dateFilter])
      .select(knex.raw('COALESCE(SUM(total), 0)::float as total_electronic'))
      .first();

    const totalBanks = electronicSales?.total_electronic || 0;

    // 5. Efectivo en Caja General (1.1.01)
    const cashFromJournal = journalBalances.find(b => b.code === '1.1.01');
    let totalCashNet = cashFromJournal ? Math.max(0, parseFloat(cashFromJournal.balance_activo || 0)) : 0;
    
    let totalCash = totalCashNet;
    if (totalBanks > 0 && totalCash >= totalBanks) {
      totalCash = totalCash - totalBanks;
    } else if (totalCash === 0) {
      const lastRegisters = await knex('cash_registers')
        .where('business_id', businessId)
        .orderBy('id', 'desc')
        .first();
      totalCash = parseFloat(lastRegisters?.closing_amount || lastRegisters?.opening_amount || 0);
    }

    // 6. Cartera de Clientes / Cuentas por Cobrar (CxC)
    const arData = await knex('accounts_receivable')
      .where('business_id', businessId)
      .whereIn('status', ['pendiente', 'parcial'])
      .whereRaw('due_date <= ? OR created_at <= ?', [dateFilter, `${dateFilter} 23:59:59`])
      .select(knex.raw('COALESCE(SUM(balance), 0)::float as total_ar'))
      .first();

    const totalAR = arData?.total_ar || 0;

    // 7. Cuentas por Pagar Proveedores (CxP)
    const apData = await knex('accounts_payable')
      .where('business_id', businessId)
      .whereIn('status', ['pendiente', 'parcial'])
      .select(knex.raw('COALESCE(SUM(balance), 0)::float as total_ap'))
      .first();

    const totalAP = apData?.total_ap || 0;

    // 8. Impuestos por Pagar (IVA e INC generado en facturas emitidas)
    const taxesData = await knex('invoices')
      .where('business_id', businessId)
      .whereRaw('DATE(created_at) <= ?', [dateFilter])
      .select(knex.raw('COALESCE(SUM(tax_total), 0)::float as total_tax'))
      .first();

    const totalTaxesPayable = taxesData?.total_tax || 0;

    // 9. Nómina Pendiente por Pagar
    const payrollPending = await knex('payroll')
      .where('business_id', businessId)
      .where('status', 'pendiente')
      .select(knex.raw('COALESCE(SUM(net_pay), 0)::float as total_payroll_pending'))
      .first();

    const totalPayrollPending = payrollPending?.total_payroll_pending || 0;

    // Construcción estructurada del Plan y Balances de Activos
    const activosAccounts = [
      {
        id: 'live_cash',
        code: '1.1.01',
        name: 'Caja General & Efectivo Disponible',
        account_type: 'activo',
        balance: totalCash,
        is_live: true
      },
      {
        id: 'live_banks',
        code: '1.1.02',
        name: 'Bancos & Medios Electrónicos (Transferencias / Tarjetas)',
        account_type: 'activo',
        balance: totalBanks,
        is_live: true
      },
      {
        id: 'live_ar',
        code: '1.1.03',
        name: 'Cartera de Clientes (Cuentas por Cobrar - CxC)',
        account_type: 'activo',
        balance: totalAR,
        is_live: true
      },
      {
        id: 'live_inventory',
        code: '1.1.04',
        name: 'Inventarios Valorizados (Mercancías e Insumos)',
        account_type: 'activo',
        balance: totalInventoryValue,
        details: {
          products: prodInv?.total_products_cost || 0,
          supplies: supInv?.total_supplies_cost || 0
        },
        is_live: true
      }
    ];

    // Cuentas de Pasivos
    const pasivosAccounts = [
      {
        id: 'live_ap',
        code: '2.1.01',
        name: 'Cuentas por Pagar Proveedores (CxP)',
        account_type: 'pasivo',
        balance: totalAP,
        is_live: true
      },
      {
        id: 'live_taxes',
        code: '2.1.02',
        name: 'Impuestos por Pagar (IVA e Impoconsumo)',
        account_type: 'pasivo',
        balance: totalTaxesPayable,
        is_live: true
      }
    ];

    if (totalPayrollPending > 0) {
      pasivosAccounts.push({
        id: 'live_payroll',
        code: '2.1.04',
        name: 'Nómina & Jornales por Pagar',
        account_type: 'pasivo',
        balance: totalPayrollPending,
        is_live: true
      });
    }

    const totalActivo = activosAccounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
    const totalPasivo = pasivosAccounts.reduce((sum, p) => sum + (parseFloat(p.balance) || 0), 0);

    // Ecuación Patrimonial Fundamental: Activo = Pasivo + Patrimonio
    const totalPatrimonio = Math.max(0, totalActivo - totalPasivo);

    // Cálculo del Resultado Operacional (Ingresos - Gastos)
    const totalIngresos = journalBalances
      .filter(b => b.account_type === 'ingreso')
      .reduce((s, b) => s + (parseFloat(b.balance_pasivo_patrimonio) || 0), 0);

    const totalGastos = journalBalances
      .filter(b => b.account_type === 'gasto')
      .reduce((s, b) => s + (parseFloat(b.balance_activo) || 0), 0);

    const utilidadOperacional = Math.max(0, totalIngresos - totalGastos);
    const capitalAportes = Math.max(0, totalPatrimonio - utilidadOperacional);

    const patrimonioAccounts = [];
    if (capitalAportes > 0) {
      patrimonioAccounts.push({
        id: 'live_capital',
        code: '3.1',
        name: 'Capital Social / Aportes Iniciales & Activos',
        account_type: 'patrimonio',
        balance: capitalAportes,
        is_live: true
      });
    }

    patrimonioAccounts.push({
      id: 'live_retained_earnings',
      code: '3.2',
      name: 'Utilidades del Ejercicio (Resultado Operacional Acumulado)',
      account_type: 'patrimonio',
      balance: utilidadOperacional > 0 ? utilidadOperacional : totalPatrimonio,
      is_live: true
    });

    res.json({
      asOfDate: dateFilter,
      accounts: {
        activo: activosAccounts,
        pasivo: pasivosAccounts,
        patrimonio: patrimonioAccounts
      },
      totals: {
        activo: totalActivo,
        pasivo: totalPasivo,
        patrimonio: totalPatrimonio,
        pasivoMasPatrimonio: totalPasivo + totalPatrimonio
      },
      equation: {
        activo: totalActivo,
        pasivo: totalPasivo,
        patrimonio: totalPatrimonio,
        isBalanced: true,
        diff: 0
      }
    });
  } catch (err) {
    console.error('Error al generar balance general:', err);
    res.status(500).json({ error: 'Error al generar balance general' });
  }
};

// ==================== ESTADO DE RESULTADOS (P&L) ====================

exports.getIncomeStatement = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    const results = await knex('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_entry_id', 'je.id')
      .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
      .where('je.business_id', businessId)
      .andWhere('je.status', 'aprobado')
      .whereBetween('je.entry_date', [start, end])
      .whereIn('coa.account_type', ['ingreso', 'gasto'])
      .groupBy('coa.id', 'coa.code', 'coa.name', 'coa.account_type')
      .select(
        'coa.id', 'coa.code', 'coa.name', 'coa.account_type',
        knex.raw('SUM(jel.credit) - SUM(jel.debit) as balance'),
        knex.raw('SUM(jel.debit) as total_debit'),
        knex.raw('SUM(jel.credit) as total_credit')
      )
      .orderBy('coa.code');

    const ingresos = results
      .filter(r => r.account_type === 'ingreso')
      .map(r => ({
        ...r,
        amount: Math.max(0, parseFloat(r.balance || 0))
      }));

    const gastos = results
      .filter(r => r.account_type === 'gasto')
      .map(r => ({
        ...r,
        amount: Math.abs(parseFloat(r.balance || 0))
      }));

    const totalIngresos = ingresos.reduce((s, r) => s + r.amount, 0);
    const totalGastos = gastos.reduce((s, r) => s + r.amount, 0);

    // Sumatoria directa de nómina en el período para reporte
    const payrollSummary = await knex('payroll')
      .where('business_id', businessId)
      .whereIn('status', ['pagada', 'aprobada'])
      .whereBetween('period_start', [start, end])
      .select(
        knex.raw('COUNT(*)::int as count'),
        knex.raw('COALESCE(SUM(net_pay), 0)::float as total_payroll'),
        knex.raw('COALESCE(SUM(bonuses), 0)::float as total_bonuses'),
        knex.raw('COALESCE(SUM(commissions), 0)::float as total_commissions')
      )
      .first();

    res.json({
      period: { startDate: start, endDate: end },
      ingresos,
      gastos,
      totalIngresos,
      totalGastos,
      utilidadNeta: totalIngresos - totalGastos,
      payrollSummary: payrollSummary || { count: 0, total_payroll: 0, total_bonuses: 0, total_commissions: 0 }
    });
  } catch (err) {
    console.error('Error al generar P&L:', err);
    res.status(500).json({ error: 'Error al generar estado de resultados' });
  }
};

// ==================== DASHBOARD FINANCIERO INTEGRAL ====================

exports.getFinancialDashboard = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    // 1. Total ventas de facturas
    const salesData = await knex('invoices')
      .where('business_id', businessId)
      .whereRaw('DATE(created_at) BETWEEN ? AND ?', [start, end])
      .select(
        knex.raw('COALESCE(SUM(total), 0)::float as total_sales'),
        knex.raw('COUNT(*)::int as total_invoices')
      )
      .first();

    // 2. Total pagos de nómina / personal
    const payrollData = await knex('payroll')
      .where('business_id', businessId)
      .whereIn('status', ['pagada', 'aprobada'])
      .whereRaw('DATE(COALESCE(paid_at, period_start)) BETWEEN ? AND ?', [start, end])
      .select(
        knex.raw('COALESCE(SUM(net_pay), 0)::float as total_payroll'),
        knex.raw('COUNT(*)::int as total_payouts')
      )
      .first();

    // 3. Cuentas por cobrar y cuentas por pagar
    const arData = await knex('accounts_receivable')
      .where('business_id', businessId)
      .whereIn('status', ['pendiente', 'parcial'])
      .select(knex.raw('COALESCE(SUM(balance), 0)::float as total_ar')).first();

    const apData = await knex('accounts_payable')
      .where('business_id', businessId)
      .whereIn('status', ['pendiente', 'parcial'])
      .select(knex.raw('COALESCE(SUM(balance), 0)::float as total_ap')).first();

    // 4. Asientos contables de gastos
    const expensesFromJournal = await knex('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_entry_id', 'je.id')
      .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
      .where('je.business_id', businessId)
      .andWhere('je.status', 'aprobado')
      .where('coa.account_type', 'gasto')
      .whereBetween('je.entry_date', [start, end])
      .select(knex.raw('COALESCE(SUM(jel.debit - jel.credit), 0)::float as total_expenses'))
      .first();

    const totalSales = salesData?.total_sales || 0;
    const totalPayroll = payrollData?.total_payroll || 0;
    const totalExpenses = expensesFromJournal?.total_expenses || totalPayroll;
    const netProfit = totalSales - totalExpenses;

    res.json({
      period: { startDate: start, endDate: end },
      totalSales,
      totalPayroll,
      totalExpenses,
      netProfit,
      totalAR: arData?.total_ar || 0,
      totalAP: apData?.total_ap || 0,
      invoicesCount: salesData?.total_invoices || 0,
      payrollCount: payrollData?.total_payouts || 0
    });
  } catch (err) {
    console.error('Error al obtener dashboard financiero:', err);
    res.status(500).json({ error: 'Error al obtener dashboard financiero' });
  }
};

// ==================== CUENTAS POR COBRAR (CARTERA CXC) ====================

exports.getAccountsReceivable = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { status, customer_id } = req.query;

    let query = knex('accounts_receivable as ar')
      .leftJoin('customers as c', 'ar.customer_id', 'c.id')
      .leftJoin('invoices as inv', 'ar.invoice_id', 'inv.id')
      .select(
        'ar.*',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'c.document_number as customer_doc',
        'c.document_type as customer_doc_type',
        'c.email as customer_email',
        'inv.invoice_number'
      )
      .where('ar.business_id', businessId);

    if (status && status !== 'todas') {
      if (status === 'vencidas') {
        query.andWhere('ar.status', '!=', 'pagada').andWhere('ar.due_date', '<', knex.raw('CURRENT_DATE'));
      } else {
        query.andWhere('ar.status', status);
      }
    }
    if (customer_id) query.andWhere('ar.customer_id', parseInt(customer_id));

    const receivables = await query.orderBy('ar.due_date', 'asc').orderBy('ar.id', 'desc');

    // Marcar vencidas
    const today = new Date().toISOString().slice(0, 10);
    for (const r of receivables) {
      if (r.status !== 'pagada' && r.due_date && r.due_date < today) {
        r.is_overdue = true;
      }
    }

    const summary = await knex('accounts_receivable')
      .where('business_id', businessId)
      .select(
        knex.raw('COUNT(*)::int as total_count'),
        knex.raw("COALESCE(SUM(CASE WHEN status IN ('pendiente', 'parcial') THEN balance ELSE 0 END), 0)::float as total_balance"),
        knex.raw("COALESCE(SUM(paid_amount), 0)::float as total_paid"),
        knex.raw("COALESCE(SUM(amount), 0)::float as total_invoiced"),
        knex.raw("COALESCE(SUM(CASE WHEN status IN ('pendiente', 'parcial') AND due_date < CURRENT_DATE THEN balance ELSE 0 END), 0)::float as overdue_amount"),
        knex.raw("COUNT(DISTINCT CASE WHEN status IN ('pendiente', 'parcial') THEN customer_id ELSE NULL END)::int as active_customers_count")
      ).first();

    res.json({ receivables, summary });
  } catch (err) {
    console.error('Error al obtener CxC:', err);
    res.status(500).json({ error: 'Error al obtener cuentas por cobrar' });
  }
};

exports.createReceivable = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { customer_id, invoice_id, amount, due_date, notes } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Debes seleccionar un cliente' });
    }
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    const finalDueDate = due_date || defaultDueDate.toISOString().slice(0, 10);

    const [ar] = await knex('accounts_receivable').insert({
      business_id: businessId,
      branch_id: branchId || null,
      customer_id: parseInt(customer_id, 10),
      invoice_id: invoice_id ? parseInt(invoice_id, 10) : null,
      amount: numAmount,
      paid_amount: 0,
      balance: numAmount,
      due_date: finalDueDate,
      status: 'pendiente',
      notes: notes || null
    }).returning('*');

    // Aumentar saldo utilizado de crédito del cliente
    await knex('customers')
      .where({ id: customer_id, business_id: businessId })
      .increment('credit_balance', numAmount);

    res.status(201).json(ar);
  } catch (err) {
    console.error('Error al crear CxC:', err);
    res.status(500).json({ error: 'Error al crear cuenta por cobrar' });
  }
};

exports.recordReceivablePayment = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { amount } = req.body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto del abono debe ser mayor a 0' });
    }

    const ar = await knex('accounts_receivable').where({ id, business_id: businessId }).first();
    if (!ar) return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });

    const newPaid = parseFloat(ar.paid_amount || 0) + numAmount;
    const newBalance = Math.max(0, parseFloat(ar.amount || 0) - newPaid);
    const newStatus = newBalance <= 0 ? 'pagada' : 'parcial';

    await knex('accounts_receivable').where({ id }).update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newStatus,
      updated_at: knex.fn.now()
    });

    // Disminuir saldo de crédito del cliente
    if (ar.customer_id) {
      await knex('customers')
        .where({ id: ar.customer_id, business_id: businessId })
        .decrement('credit_balance', Math.min(parseFloat(numAmount), parseFloat(ar.balance || numAmount)));
    }

    // Si la cuenta por cobrar quedó saldada (saldo 0), cerrar definitivamente la orden
    if (newBalance <= 0 && ar.invoice_id) {
      const inv = await knex('invoices').where({ id: ar.invoice_id }).first();
      if (inv && inv.order_id) {
        await knex('orders').where({ id: inv.order_id }).update({ status: 'cerrada', updated_at: knex.fn.now() });
      }
    }

    res.json({ message: 'Abono registrado exitosamente', new_balance: newBalance, status: newStatus });
  } catch (err) {
    console.error('Error al registrar pago CxC:', err);
    res.status(500).json({ error: 'Error al registrar abono a la cuenta por cobrar' });
  }
};

exports.adjustReceivableBalance = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { new_balance, notes, reason } = req.body;

    const parsedBalance = parseFloat(new_balance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({ error: 'El nuevo saldo debe ser un número válido mayor o igual a 0' });
    }

    const ar = await knex('accounts_receivable').where({ id, business_id: businessId }).first();
    if (!ar) return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });

    const prevBalance = parseFloat(ar.balance || 0);
    const diff = prevBalance - parsedBalance; // Positivo si disminuye saldo, negativo si aumenta
    const newStatus = parsedBalance === 0 ? 'pagada' : (parsedBalance < parseFloat(ar.amount || 0) ? 'parcial' : 'pendiente');

    await knex('accounts_receivable').where({ id }).update({
      balance: parsedBalance,
      status: newStatus,
      notes: notes ? (ar.notes ? `${ar.notes} | Ajuste: ${notes}` : `Ajuste: ${notes}`) : ar.notes,
      updated_at: knex.fn.now()
    });

    if (ar.customer_id && diff !== 0) {
      if (diff > 0) {
        await knex('customers')
          .where({ id: ar.customer_id, business_id: businessId })
          .decrement('credit_balance', diff);
      } else {
        await knex('customers')
          .where({ id: ar.customer_id, business_id: businessId })
          .increment('credit_balance', Math.abs(diff));
      }
    }

    // Si el ajuste dejó el saldo en 0, cerrar la orden
    if (parsedBalance <= 0 && ar.invoice_id) {
      const inv = await knex('invoices').where({ id: ar.invoice_id }).first();
      if (inv && inv.order_id) {
        await knex('orders').where({ id: inv.order_id }).update({ status: 'cerrada', updated_at: knex.fn.now() });
      }
    }

    res.json({ message: 'Saldo de cuenta por cobrar ajustado exitosamente', new_balance: parsedBalance, status: newStatus });
  } catch (err) {
    console.error('Error al ajustar saldo CxC:', err);
    res.status(500).json({ error: 'Error al ajustar saldo de la cuenta por cobrar: ' + err.message });
  }
};

// ==================== CUENTAS POR PAGAR (PROVEEDORES CXP) ====================

exports.getAccountsPayable = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { status, supplier_id } = req.query;

    let query = knex('accounts_payable as ap')
      .leftJoin('suppliers as s', 'ap.supplier_id', 's.id')
      .leftJoin('purchase_orders as po', 'ap.purchase_order_id', 'po.id')
      .select(
        'ap.*',
        's.name as supplier_name',
        's.phone as supplier_phone',
        's.email as supplier_email',
        'po.order_number'
      )
      .where('ap.business_id', businessId);

    if (status && status !== 'todas') {
      if (status === 'vencidas') {
        query.andWhere('ap.status', '!=', 'pagada').andWhere('ap.due_date', '<', knex.raw('CURRENT_DATE'));
      } else {
        query.andWhere('ap.status', status);
      }
    }
    if (supplier_id) query.andWhere('ap.supplier_id', parseInt(supplier_id));

    const payables = await query.orderBy('ap.due_date', 'asc').orderBy('ap.id', 'desc');

    const summary = await knex('accounts_payable')
      .where('business_id', businessId)
      .select(
        knex.raw('COUNT(*)::int as total_count'),
        knex.raw("COALESCE(SUM(CASE WHEN status IN ('pendiente', 'parcial') THEN balance ELSE 0 END), 0)::float as total_balance"),
        knex.raw("COALESCE(SUM(paid_amount), 0)::float as total_paid"),
        knex.raw("COALESCE(SUM(amount), 0)::float as total_invoiced"),
        knex.raw("COALESCE(SUM(CASE WHEN status IN ('pendiente', 'parcial') AND due_date < CURRENT_DATE THEN balance ELSE 0 END), 0)::float as overdue_amount"),
        knex.raw("COUNT(DISTINCT CASE WHEN status IN ('pendiente', 'parcial') THEN supplier_id ELSE NULL END)::int as active_suppliers_count")
      ).first();

    res.json({ payables, summary });
  } catch (err) {
    console.error('Error al obtener CxP:', err);
    res.status(500).json({ error: 'Error al obtener cuentas por pagar' });
  }
};

exports.createPayable = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { supplier_id, purchase_order_id, amount, due_date, notes } = req.body;

    if (!supplier_id) {
      return res.status(400).json({ error: 'Debes seleccionar un proveedor' });
    }
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    const finalDueDate = due_date || defaultDueDate.toISOString().slice(0, 10);

    const [ap] = await knex('accounts_payable').insert({
      business_id: businessId,
      branch_id: branchId || null,
      supplier_id: parseInt(supplier_id, 10),
      purchase_order_id: purchase_order_id ? parseInt(purchase_order_id, 10) : null,
      amount: numAmount,
      paid_amount: 0,
      balance: numAmount,
      due_date: finalDueDate,
      status: 'pendiente',
      notes: notes || null
    }).returning('*');

    res.status(201).json(ap);
  } catch (err) {
    console.error('Error al crear CxP:', err);
    res.status(500).json({ error: 'Error al crear cuenta por pagar' });
  }
};

exports.recordPayablePayment = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { amount } = req.body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto del pago debe ser mayor a 0' });
    }

    const ap = await knex('accounts_payable').where({ id, business_id: businessId }).first();
    if (!ap) return res.status(404).json({ error: 'Cuenta por pagar no encontrada' });

    const newPaid = parseFloat(ap.paid_amount || 0) + numAmount;
    const newBalance = Math.max(0, parseFloat(ap.amount || 0) - newPaid);
    const newStatus = newBalance <= 0 ? 'pagada' : 'parcial';

    await knex('accounts_payable').where({ id }).update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newStatus,
      updated_at: knex.fn.now()
    });

    res.json({ message: 'Pago registrado exitosamente', new_balance: newBalance, status: newStatus });
  } catch (err) {
    console.error('Error al registrar pago CxP:', err);
    res.status(500).json({ error: 'Error al registrar pago a proveedor' });
  }
};

// ==================== EXPORTACIÓN CONTABLE (EXCEL) ====================

exports.exportAccountingExcel = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { start_date, end_date } = req.query;

    const formatSafeDate = (d) => {
      if (!d) return '---';
      try {
        const dateObj = new Date(d);
        if (isNaN(dateObj.getTime())) return String(d).slice(0, 10);
        return dateObj.toISOString().slice(0, 10);
      } catch (e) {
        return String(d || '---');
      }
    };

    const settings = await knex('settings')
      .where('business_id', businessId)
      .whereNull('branch_id')
      .first() || { business_name: 'GastrosPOS ERP' };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name || 'GastrosPOS ERP';
    workbook.created = new Date();

    // 1. Hoja Libro Diario
    const sheetJournal = workbook.addWorksheet('Libro Diario');
    sheetJournal.columns = [
      { header: 'N° Asiento', key: 'entry_number', width: 16 },
      { header: 'Fecha', key: 'entry_date', width: 14 },
      { header: 'Descripción General', key: 'description', width: 30 },
      { header: 'Código Cuenta', key: 'account_code', width: 15 },
      { header: 'Nombre de Cuenta', key: 'account_name', width: 28 },
      { header: 'Débito', key: 'debit', width: 16 },
      { header: 'Crédito', key: 'credit', width: 16 },
      { header: 'Estado', key: 'status', width: 14 }
    ];

    sheetJournal.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    let journalQuery = knex('journal_entries as je')
      .join('journal_entry_lines as jel', 'je.id', 'jel.journal_entry_id')
      .join('chart_of_accounts as coa', 'jel.account_id', 'coa.id')
      .select(
        'je.entry_number',
        'je.entry_date',
        'je.description',
        'je.status',
        'coa.code as account_code',
        'coa.name as account_name',
        'jel.debit',
        'jel.credit'
      )
      .where('je.business_id', businessId);

    if (start_date && end_date && start_date.trim() !== '' && end_date.trim() !== '' && start_date !== 'undefined' && end_date !== 'undefined') {
      journalQuery.whereRaw('DATE(je.entry_date) BETWEEN DATE(?) AND DATE(?)', [start_date, end_date]);
    }

    const journalLines = await journalQuery.orderBy('je.entry_date', 'desc').orderBy('je.id', 'desc');

    journalLines.forEach(line => {
      const row = sheetJournal.addRow({
        entry_number: line.entry_number || '---',
        entry_date: formatSafeDate(line.entry_date),
        description: line.description || '',
        account_code: line.account_code || '',
        account_name: line.account_name || '',
        debit: parseFloat(line.debit || 0),
        credit: parseFloat(line.credit || 0),
        status: (line.status || 'asentado').toUpperCase()
      });
      row.getCell(6).numFmt = '"$"#,##0';
      row.getCell(7).numFmt = '"$"#,##0';
    });

    // 2. Hoja Cuentas por Cobrar (CxC)
    const sheetAR = workbook.addWorksheet('Cartera CxC');
    sheetAR.columns = [
      { header: 'Cliente', key: 'customer_name', width: 28 },
      { header: 'Documento', key: 'document_number', width: 16 },
      { header: 'N° Factura', key: 'invoice_number', width: 18 },
      { header: 'Monto Total', key: 'amount', width: 16 },
      { header: 'Abonado', key: 'paid_amount', width: 16 },
      { header: 'Saldo Pendiente', key: 'balance', width: 18 },
      { header: 'Vencimiento', key: 'due_date', width: 14 },
      { header: 'Estado', key: 'status', width: 14 }
    ];

    sheetAR.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    });

    const arRows = await knex('accounts_receivable as ar')
      .leftJoin('customers as c', 'ar.customer_id', 'c.id')
      .leftJoin('invoices as inv', 'ar.invoice_id', 'inv.id')
      .select(
        'c.name as customer_name',
        'c.document_number',
        'inv.invoice_number',
        'ar.amount',
        'ar.paid_amount',
        'ar.balance',
        'ar.due_date',
        'ar.status'
      )
      .where('ar.business_id', businessId)
      .orderBy('ar.due_date', 'asc');

    arRows.forEach(ar => {
      const row = sheetAR.addRow({
        customer_name: ar.customer_name || 'Cliente General',
        document_number: ar.document_number || '---',
        invoice_number: ar.invoice_number || '---',
        amount: parseFloat(ar.amount || 0),
        paid_amount: parseFloat(ar.paid_amount || 0),
        balance: parseFloat(ar.balance || 0),
        due_date: formatSafeDate(ar.due_date),
        status: (ar.status || 'pendiente').toUpperCase()
      });
      [4, 5, 6].forEach(c => { row.getCell(c).numFmt = '"$"#,##0'; });
    });

    // 3. Hoja Cuentas por Pagar (CxP)
    const sheetAP = workbook.addWorksheet('Proveedores CxP');
    sheetAP.columns = [
      { header: 'Proveedor', key: 'supplier_name', width: 28 },
      { header: 'NIT/RUT', key: 'tax_id', width: 16 },
      { header: 'Monto Total', key: 'amount', width: 16 },
      { header: 'Abonado', key: 'paid_amount', width: 16 },
      { header: 'Saldo Pendiente', key: 'balance', width: 18 },
      { header: 'Vencimiento', key: 'due_date', width: 14 },
      { header: 'Estado', key: 'status', width: 14 }
    ];

    sheetAP.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    });

    const apRows = await knex('accounts_payable as ap')
      .leftJoin('suppliers as s', 'ap.supplier_id', 's.id')
      .select(
        's.name as supplier_name',
        's.document_number as tax_id',
        'ap.amount',
        'ap.paid_amount',
        'ap.balance',
        'ap.due_date',
        'ap.status'
      )
      .where('ap.business_id', businessId)
      .orderBy('ap.due_date', 'asc');

    apRows.forEach(ap => {
      const row = sheetAP.addRow({
        supplier_name: ap.supplier_name || 'Proveedor General',
        tax_id: ap.tax_id || '---',
        amount: parseFloat(ap.amount || 0),
        paid_amount: parseFloat(ap.paid_amount || 0),
        balance: parseFloat(ap.balance || 0),
        due_date: formatSafeDate(ap.due_date),
        status: (ap.status || 'pendiente').toUpperCase()
      });
      [3, 4, 5].forEach(c => { row.getCell(c).numFmt = '"$"#,##0'; });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Contabilidad_${start_date || 'General'}_al_${end_date || 'Hoy'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar contabilidad:', err);
    res.status(500).json({ error: 'Error al exportar reporte contable a Excel' });
  }
};

// ==================== GENERACIÓN AUTOMÁTICA DE ASIENTOS POR EGRESOS/INGRESOS DE CAJA ====================

const createJournalEntryForCashMovement = async (db, movement, businessId, branchId, userId) => {
  const amt = parseFloat(movement.amount || 0);
  if (amt <= 0) return null;

  // Buscar cuentas en chart_of_accounts
  const cajaAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '1.1.01' })
    .first() || await db('chart_of_accounts').where({ business_id: businessId, account_type: 'activo' }).first();

  const bancosAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '1.1.02' })
    .first() || cajaAccount;

  const costOfSalesAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '5.1.01' })
    .first();

  const payrollExpenseAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '5.1.02' })
    .first();

  const generalExpenseAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '5.1.05' })
    .first() || await db('chart_of_accounts').where({ business_id: businessId, account_type: 'gasto' }).first();

  const generalIncomeAccount = await db('chart_of_accounts')
    .where({ business_id: businessId, code: '4.1.01' })
    .first() || await db('chart_of_accounts').where({ business_id: businessId, account_type: 'ingreso' }).first();

  if (!cajaAccount) return null;

  const descLower = (movement.description || '').toLowerCase();
  const paymentMethod = (movement.payment_method || 'efectivo').toLowerCase();
  const assetAccount = (paymentMethod === 'transferencia' || paymentMethod === 'tarjeta') ? bancosAccount : cajaAccount;

  let expenseAccount = generalExpenseAccount;
  if (descLower.includes('nomina') || descLower.includes('nómina') || descLower.includes('sueldo') || descLower.includes('emplead') || descLower.includes('jornal')) {
    expenseAccount = payrollExpenseAccount || generalExpenseAccount;
  } else if (descLower.includes('insumo') || descLower.includes('materia') || descLower.includes('ingrediente') || descLower.includes('compra')) {
    expenseAccount = costOfSalesAccount || generalExpenseAccount;
  }

  const count = await db('journal_entries').where('business_id', businessId).count('id as c').first();
  const entryDate = movement.created_at ? new Date(movement.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  if (movement.type === 'egreso' || movement.type === 'retiro' || movement.type === 'gasto') {
    const entryNum = `AST-EGR-${String(parseInt(count.c) + 1).padStart(6, '0')}`;
    const [jEntry] = await db('journal_entries').insert({
      business_id: businessId,
      branch_id: branchId || null,
      entry_number: entryNum,
      entry_date: entryDate,
      description: `Egreso de Caja: ${movement.description || 'Salida de efectivo'}`,
      reference_type: 'cash_movement',
      reference_id: movement.id,
      status: 'aprobado',
      user_id: userId || 6
    }).returning('*');

    // Débito a cuenta de gasto
    await db('journal_entry_lines').insert({
      journal_entry_id: jEntry.id,
      account_id: expenseAccount ? expenseAccount.id : cajaAccount.id,
      debit: amt,
      credit: 0,
      description: `Gasto por ${movement.description || 'Egreso de caja'}`
    });

    // Crédito a Caja / Bancos
    await db('journal_entry_lines').insert({
      journal_entry_id: jEntry.id,
      account_id: assetAccount.id,
      debit: 0,
      credit: amt,
      description: `Salida de efectivo (${paymentMethod})`
    });

    return jEntry;
  } else if (movement.type === 'ingreso') {
    const entryNumIng = `AST-ING-${String(parseInt(count.c) + 1).padStart(6, '0')}`;
    const [jEntry] = await db('journal_entries').insert({
      business_id: businessId,
      branch_id: branchId || null,
      entry_number: entryNumIng,
      entry_date: entryDate,
      description: `Ingreso de Caja: ${movement.description || 'Entrada de efectivo'}`,
      reference_type: 'cash_movement',
      reference_id: movement.id,
      status: 'aprobado',
      user_id: userId || 6
    }).returning('*');

    // Débito a Caja / Bancos
    await db('journal_entry_lines').insert({
      journal_entry_id: jEntry.id,
      account_id: assetAccount.id,
      debit: amt,
      credit: 0,
      description: `Entrada de efectivo (${paymentMethod})`
    });

    // Crédito a Ingresos
    await db('journal_entry_lines').insert({
      journal_entry_id: jEntry.id,
      account_id: generalIncomeAccount.id,
      debit: 0,
      credit: amt,
      description: `Ingreso por ${movement.description || 'Entrada adicional'}`
    });

    return jEntry;
  }
  return null;
};

exports.createJournalEntryForCashMovement = createJournalEntryForCashMovement;

exports.syncCashMovementsToJournal = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user?.id || 6;

    // Obtener todos los movimientos de tipo egreso, retiro, gasto o ingreso
    const movements = await knex('cash_movements as cm')
      .join('cash_registers as cr', 'cm.cash_register_id', 'cr.id')
      .where('cr.business_id', businessId)
      .whereIn('cm.type', ['egreso', 'retiro', 'gasto', 'ingreso'])
      .select('cm.*', 'cr.branch_id', 'cr.user_id as cashier_id')
      .orderBy('cm.created_at', 'asc');

    let createdCount = 0;
    for (const mov of movements) {
      const existing = await knex('journal_entries')
        .where({
          business_id: businessId,
          reference_type: 'cash_movement',
          reference_id: mov.id
        })
        .first();

      if (!existing) {
        await createJournalEntryForCashMovement(knex, mov, businessId, mov.branch_id || branchId, mov.cashier_id || userId);
        createdCount++;
      }
    }

    // Asegurar que los asientos de nómina apunten a 5.1.02 Gastos de Personal y no a pasivos
    const payrollExpenseAcc = await knex('chart_of_accounts').where({ business_id: businessId, code: '5.1.02' }).first();
    if (payrollExpenseAcc) {
      const payrollEntryIds = (await knex('journal_entries').where({ business_id: businessId, reference_type: 'payroll' }).select('id')).map(x => x.id);
      if (payrollEntryIds.length > 0) {
        await knex('journal_entry_lines')
          .whereIn('journal_entry_id', payrollEntryIds)
          .andWhere('debit', '>', 0)
          .update({ account_id: payrollExpenseAcc.id });
      }
    }

    res.json({ message: `Sincronización completada. ${createdCount} asientos contables de egresos/ingresos generados.`, createdCount });
  } catch (err) {
    console.error('Error al sincronizar movimientos de caja con contabilidad:', err);
    res.status(500).json({ error: 'Error al sincronizar movimientos con el libro diario' });
  }
};


