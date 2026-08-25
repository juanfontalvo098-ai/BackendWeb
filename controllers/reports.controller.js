/**
 * Reports Controller — Multi-tenant
 * Reportes de turno y análisis BI con exportación enriquecida a Excel (incluyendo insumos, recetas y márgenes)
 */
const knex = require('../database/knex');
const ExcelJS = require('exceljs');

/**
 * Helper: Calcula el desglose de insumos consumidos para una o varias cajas / turnos
 */
async function calculateSuppliesUsageForShifts(cashRegisterIds, businessId) {
  if (!cashRegisterIds || cashRegisterIds.length === 0) {
    return { supplies: [], totalSuppliesCost: 0, productsSold: [] };
  }

  // 1. Obtener todos los items vendidos en esas cajas
  const orderItems = await knex('order_items as oi')
    .join('invoices as inv', 'oi.order_id', 'inv.order_id')
    .join('products as p', 'oi.product_id', 'p.id')
    .leftJoin('categories as c', 'p.category_id', 'c.id')
    .select(
      'oi.product_id',
      'p.name as product_name',
      'p.sku as product_sku',
      'c.name as category_name',
      knex.raw('SUM(oi.quantity)::float as total_units_sold'),
      knex.raw('SUM(oi.quantity * oi.unit_price)::float as total_revenue')
    )
    .whereIn('inv.cash_register_id', cashRegisterIds)
    .andWhere('inv.business_id', businessId)
    .groupBy('oi.product_id', 'p.name', 'p.sku', 'c.name');

  // 2. Mapear recetas e insumos
  const suppliesMap = {};
  let totalSuppliesCost = 0;

  for (const item of orderItems) {
    const recipe = await knex('recipes')
      .where({ product_id: item.product_id, business_id: businessId })
      .first();

    if (recipe) {
      const recipeItems = await knex('recipe_items as ri')
        .join('supplies as s', 'ri.supply_id', 's.id')
        .select(
          'ri.supply_id',
          'ri.quantity as qty_per_unit',
          's.name as supply_name',
          's.unit_of_measure',
          's.category as supply_category',
          's.cost_price'
        )
        .where('ri.recipe_id', recipe.id);

      recipeItems.forEach(ri => {
        const supplyId = ri.supply_id;
        const qtyPerUnit = parseFloat(ri.qty_per_unit || 0);
        const totalQty = qtyPerUnit * item.total_units_sold;
        const unitCost = parseFloat(ri.cost_price || 0);
        const lineCost = totalQty * unitCost;

        if (!suppliesMap[supplyId]) {
          suppliesMap[supplyId] = {
            supply_id: supplyId,
            name: ri.supply_name,
            category: ri.supply_category || 'General',
            unit: ri.unit_of_measure,
            cost_price: unitCost,
            total_used: 0,
            total_cost: 0,
            used_in_products: []
          };
        }

        suppliesMap[supplyId].total_used += totalQty;
        suppliesMap[supplyId].total_cost += lineCost;
        totalSuppliesCost += lineCost;

        suppliesMap[supplyId].used_in_products.push({
          product_name: item.product_name,
          units_sold: item.total_units_sold,
          qty_per_unit: qtyPerUnit,
          consumed: totalQty
        });
      });
    }
  }

  const suppliesList = Object.values(suppliesMap).sort((a, b) => b.total_cost - a.total_cost);
  return {
    supplies: suppliesList,
    totalSuppliesCost,
    productsSold: orderItems
  };
}

exports.getShifts = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { startDate, endDate, user_id } = req.query;

    let query = knex('shift_reports')
      .select('id', 'cash_register_id', 'user_id', 'user_name', 'shift_name', 'opened_at', 'closed_at',
        'opening_amount', 'closing_amount', 'expected_amount', 'difference', 'gross_revenue', 'net_revenue',
        'tax_total', 'total_tips', 'total_tickets', 'cash_sales', 'card_sales', 'transfer_sales',
        'total_withdrawals', 'total_voids', 'created_at')
      .where('business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('branch_id', branchId);
    }

    if (startDate && endDate) {
      query.whereRaw('DATE(closed_at) BETWEEN DATE(?) AND DATE(?)', [startDate, endDate]);
    }
    if (user_id) {
      query.andWhere('user_id', user_id);
    }

    const shifts = await query.orderBy('id', 'desc');
    res.json(shifts);
  } catch (err) {
    console.error('Error obteniendo informe de turnos:', err);
    res.status(500).json({ error: 'Error al consultar historial de turnos' });
  }
};

exports.getShiftById = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    // Buscar primero por ID de reporte exacto
    let shift = await knex('shift_reports')
      .where({ business_id: businessId, id })
      .first();

    if (!shift) {
      shift = await knex('shift_reports')
        .where({ business_id: businessId, cash_register_id: id })
        .first();
    }

    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    if (typeof shift.snapshot_json === 'string') {
      try { shift.snapshot = JSON.parse(shift.snapshot_json); } catch (e) {
        shift.snapshot = { invoices: [], itemizedSales: [], movements: [] };
      }
    } else {
      shift.snapshot = shift.snapshot_json || { invoices: [], itemizedSales: [], movements: [] };
    }
    delete shift.snapshot_json;

    res.json(shift);
  } catch (err) {
    console.error('Error al obtener detalle de turno:', err);
    res.status(500).json({ error: 'Error al obtener detalle de turno' });
  }
};

exports.exportShiftExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    let shift = await knex('shift_reports')
      .where({ business_id: businessId, id })
      .first();

    if (!shift) {
      shift = await knex('shift_reports')
        .where({ business_id: businessId, cash_register_id: id })
        .first();
    }

    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    let snapshot = { invoices: [], itemizedSales: [], movements: [] };
    if (typeof shift.snapshot_json === 'string') {
      try { snapshot = JSON.parse(shift.snapshot_json); } catch (e) {}
    } else if (shift.snapshot_json) {
      snapshot = shift.snapshot_json;
    }

    const settings = await knex('settings')
      .where('business_id', businessId)
      .whereNull('branch_id')
      .first() || { business_name: 'GastrosPOS Enterprise', nit: '900.123.456-7' };

    // Calcular insumos consumidos para este turno
    const suppliesData = await calculateSuppliesUsageForShifts([shift.cash_register_id], businessId);

    // Obtener movimientos de caja de la base de datos
    const cashMovements = await knex('cash_movements')
      .where('cash_register_id', shift.cash_register_id)
      .orderBy('created_at', 'asc');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name || 'GastrosPOS ERP';
    workbook.created = new Date();

    // ==================== SHEET 1: Resumen de Turno (Reporte Z) ====================
    const sheet1 = workbook.addWorksheet('Resumen de Turno (Reporte Z)');
    sheet1.columns = [{ width: 34 }, { width: 24 }, { width: 24 }, { width: 24 }];

    sheet1.mergeCells('A1:D1');
    const headerCell = sheet1.getCell('A1');
    headerCell.value = (settings.business_name || 'GastrosPOS').toUpperCase();
    headerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 30;

    sheet1.mergeCells('A2:D2');
    const subHeader = sheet1.getCell('A2');
    subHeader.value = `INFORME DE CIERRE DE CAJA (TURNO N° ${shift.id}) - NIT: ${settings.nit || '---'}`;
    subHeader.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    subHeader.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet1.addRow([]);
    sheet1.addRow(['Cajero / Responsable:', shift.user_name || '---', 'Nombre Turno:', shift.shift_name || 'Turno General']);
    sheet1.addRow(['Apertura de Caja:', shift.opened_at ? new Date(shift.opened_at).toLocaleString() : '---', 'Cierre de Caja:', shift.closed_at ? new Date(shift.closed_at).toLocaleString() : '---']);
    sheet1.getRow(4).font = { bold: true };
    sheet1.getRow(5).font = { bold: true };
    sheet1.addRow([]);

    // 1. Control de Efectivo
    const rowTitle1 = sheet1.addRow(['1. CONTROL DE EFECTIVO Y ARQUEO']);
    rowTitle1.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblCashHeader = sheet1.addRow(['Base Inicial', 'Esperado en Caja', 'Declarado (Físico)', 'Diferencia / Arqueo']);
    tblCashHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'right' };
    });

    const diff = parseFloat(shift.difference || 0);
    const cashRow = sheet1.addRow([
      parseFloat(shift.opening_amount || 0), parseFloat(shift.expected_amount || 0),
      parseFloat(shift.closing_amount || 0), diff
    ]);
    cashRow.eachCell((cell, colNumber) => {
      cell.numFmt = '"$"#,##0';
      cell.alignment = { horizontal: 'right' };
      cell.font = { bold: true };
      if (colNumber === 4) {
        cell.font = { bold: true, color: { argb: diff < 0 ? 'FFED1D5DB' : 'FF16A34A' } };
      }
    });

    sheet1.addRow([]);

    // 2. Ventas y Medios de Pago
    const rowTitle2 = sheet1.addRow(['2. VENTAS Y MEDIOS DE PAGO']);
    rowTitle2.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblPayHeader = sheet1.addRow(['Medio de Pago', 'Monto Total Recaudado', '% del Total', 'Comprobantes']);
    tblPayHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    });

    const gr = parseFloat(shift.gross_revenue || 0);
    const cs = parseFloat(shift.cash_sales || 0);
    const cas = parseFloat(shift.card_sales || 0);
    const ts = parseFloat(shift.transfer_sales || 0);

    const rEfe = sheet1.addRow(['Efectivo (Ventas)', cs, `${gr > 0 ? ((cs / gr) * 100).toFixed(1) : 0}%`, '---']);
    const rTar = sheet1.addRow(['Tarjeta Crédito/Débito', cas, `${gr > 0 ? ((cas / gr) * 100).toFixed(1) : 0}%`, '---']);
    const rTra = sheet1.addRow(['Transferencia / Nequi', ts, `${gr > 0 ? ((ts / gr) * 100).toFixed(1) : 0}%`, '---']);
    [rEfe, rTar, rTra].forEach(r => { r.getCell(2).numFmt = '"$"#,##0'; });

    const rowTotPay = sheet1.addRow(['TOTAL VENTAS BRUTAS', gr, '100.0%', shift.total_tickets || (snapshot.invoices || []).length]);
    rowTotPay.font = { bold: true };
    rowTotPay.getCell(2).numFmt = '"$"#,##0';

    sheet1.addRow([]);

    // 3. Rentabilidad, Insumos e Impuestos
    const rowTitle3 = sheet1.addRow(['3. COSTEO, IMPUESTOS Y UTILIDAD OPERATIVA DEL TURNO']);
    rowTitle3.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const netRev = parseFloat(shift.net_revenue || 0);
    const suppCost = suppliesData.totalSuppliesCost || 0;
    const grossProfit = Math.max(0, netRev - suppCost);
    const profitMargin = netRev > 0 ? ((grossProfit / netRev) * 100).toFixed(1) : 0;

    const rNet = sheet1.addRow(['Ventas Netas (Sin Impuestos):', netRev, 'Impuestos Recaudados:', parseFloat(shift.tax_total || 0)]);
    const rSupp = sheet1.addRow(['Costo Insumos Consumidos (Recetas):', suppCost, 'Propinas Recaudadas:', parseFloat(shift.total_tips || 0)]);
    const rProf = sheet1.addRow(['Ganancia Bruta Operativa Estimada:', grossProfit, 'Margen Bruto Operativo:', `${profitMargin}%`]);
    const rWith = sheet1.addRow(['Egresos y Retiros de Caja:', parseFloat(shift.total_withdrawals || 0), 'Valor en Anulaciones:', parseFloat(shift.total_voids || 0)]);

    [rNet, rSupp, rProf, rWith].forEach(r => {
      r.getCell(2).numFmt = '"$"#,##0';
      r.getCell(4).numFmt = '"$"#,##0';
      r.font = { bold: true };
    });
    rProf.getCell(1).font = { bold: true, color: { argb: 'FF10B981' } };
    rProf.getCell(2).font = { bold: true, color: { argb: 'FF10B981' } };

    // ==================== SHEET 2: Insumos y Materia Prima Consumida ====================
    const sheetSupplies = workbook.addWorksheet('Insumos Consumidos (Recetas)');
    sheetSupplies.columns = [
      { header: 'Insumo / Materia Prima', key: 'name', width: 30 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Unidad de Medida', key: 'unit', width: 18 },
      { header: 'Cantidad Consumida', key: 'total_used', width: 22 },
      { header: 'Costo Unitario Promedio', key: 'cost_price', width: 24 },
      { header: 'Costo Total Consumido', key: 'total_cost', width: 24 },
      { header: 'Utilizado en Productos', key: 'used_in', width: 45 }
    ];

    sheetSupplies.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    });

    suppliesData.supplies.forEach(s => {
      const usedInStr = s.used_in_products.map(p => `${p.product_name} (${p.units_sold} unids)`).join(', ');
      const row = sheetSupplies.addRow({
        name: s.name,
        category: s.category,
        unit: s.unit,
        total_used: parseFloat(s.total_used.toFixed(2)),
        cost_price: parseFloat(s.cost_price || 0),
        total_cost: parseFloat(s.total_cost || 0),
        used_in: usedInStr
      });
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '"$"#,##0';
      row.getCell(6).numFmt = '"$"#,##0';
    });

    const totSuppRow = sheetSupplies.addRow({
      name: 'TOTAL COSTO DE INSUMOS CONSUMIDOS',
      total_cost: suppliesData.totalSuppliesCost
    });
    totSuppRow.font = { bold: true };
    totSuppRow.getCell(6).numFmt = '"$"#,##0';

    // ==================== SHEET 3: Ventas por Producto ====================
    const sheet3 = workbook.addWorksheet('Ventas por Producto');
    sheet3.columns = [
      { header: 'Categoría', key: 'category_name', width: 22 },
      { header: 'Nombre del Producto', key: 'product_name', width: 32 },
      { header: 'Unidades Vendidas', key: 'quantity', width: 18 },
      { header: 'Precio Unitario', key: 'unit_price', width: 20 },
      { header: 'Total Recaudado', key: 'total_sales', width: 22 },
      { header: '% Participación', key: 'share', width: 18 }
    ];

    sheet3.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    (snapshot.itemizedSales || []).forEach(item => {
      const totSale = parseFloat(item.total_sales || 0);
      const row = sheet3.addRow({
        category_name: item.category_name || 'General',
        product_name: item.product_name,
        quantity: parseInt(item.quantity || 0, 10),
        unit_price: parseFloat(item.unit_price || 0),
        total_sales: totSale,
        share: `${gr > 0 ? ((totSale / gr) * 100).toFixed(1) : 0}%`
      });
      row.getCell(4).numFmt = '"$"#,##0';
      row.getCell(5).numFmt = '"$"#,##0';
    });

    // ==================== SHEET 4: Historial de Transacciones (Facturas) ====================
    const sheet2 = workbook.addWorksheet('Historial de Facturas');
    sheet2.columns = [
      { header: 'N° Factura', key: 'invoice_number', width: 24 },
      { header: 'Fecha y Hora', key: 'created_at', width: 22 },
      { header: 'Mesa / Canal', key: 'table_number', width: 16 },
      { header: 'Mesero / Atendido por', key: 'waiter_name', width: 24 },
      { header: 'Método de Pago', key: 'payment_method', width: 18 },
      { header: 'Subtotal', key: 'subtotal', width: 16 },
      { header: 'Impuestos', key: 'tax_total', width: 16 },
      { header: 'Propina', key: 'tip_amount', width: 16 },
      { header: 'Total Facturado', key: 'total', width: 18 }
    ];

    sheet2.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    (snapshot.invoices || []).forEach(inv => {
      const row = sheet2.addRow({
        invoice_number: inv.invoice_number,
        created_at: inv.created_at ? new Date(inv.created_at).toLocaleString() : '---',
        table_number: inv.table_number || `Mesa ${inv.table_id || '---'}`,
        waiter_name: inv.waiter_name || 'Mesero',
        payment_method: (inv.payment_method || 'efectivo').toUpperCase(),
        subtotal: parseFloat(inv.subtotal || 0),
        tax_total: parseFloat(inv.tax_total || 0),
        tip_amount: parseFloat(inv.tip_amount || 0),
        total: parseFloat(inv.total || 0)
      });
      [6, 7, 8, 9].forEach(i => { row.getCell(i).numFmt = '"$"#,##0'; });
    });

    // ==================== SHEET 5: Movimientos de Caja y Gastos ====================
    const sheetMov = workbook.addWorksheet('Movimientos de Caja');
    sheetMov.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Tipo de Movimiento', key: 'type', width: 22 },
      { header: 'Monto', key: 'amount', width: 18 },
      { header: 'Método', key: 'payment_method', width: 16 },
      { header: 'Descripción / Concepto', key: 'description', width: 35 },
      { header: 'Fecha y Hora', key: 'created_at', width: 22 }
    ];

    sheetMov.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    });

    cashMovements.forEach(m => {
      const row = sheetMov.addRow({
        id: m.id,
        type: (m.type || 'egreso').toUpperCase(),
        amount: parseFloat(m.amount || 0),
        payment_method: (m.payment_method || 'efectivo').toUpperCase(),
        description: m.description || 'Sin concepto',
        created_at: m.created_at ? new Date(m.created_at).toLocaleString() : '---'
      });
      row.getCell(3).numFmt = '"$"#,##0';
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Z_Turno_${shift.id}_Detallado.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generando archivo Excel de turno:', err);
    res.status(500).json({ error: 'Error al exportar reporte Excel' });
  }
};

/**
 * EXPORTACIÓN CONSOLIDADA DE REPORTES & BI (PERÍODO COMPLETO)
 */
exports.exportConsolidatedExcel = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;
    const { startDate, endDate, user_id } = req.query;

    let query = knex('shift_reports')
      .where('business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('branch_id', branchId);
    }
    if (startDate && endDate) {
      query.whereRaw('DATE(closed_at) BETWEEN DATE(?) AND DATE(?)', [startDate, endDate]);
    }
    if (user_id) {
      query.andWhere('user_id', user_id);
    }

    const shifts = await query.orderBy('id', 'desc');

    if (shifts.length === 0) {
      return res.status(400).json({ error: 'No se encontraron turnos en el período seleccionado' });
    }

    const cashRegisterIds = shifts.map(s => s.cash_register_id);
    const suppliesData = await calculateSuppliesUsageForShifts(cashRegisterIds, businessId);

    const settings = await knex('settings')
      .where('business_id', businessId)
      .whereNull('branch_id')
      .first() || { business_name: 'GastrosPOS Enterprise', nit: '900.123.456-7' };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name || 'GastrosPOS ERP';
    workbook.created = new Date();

    // ==================== SHEET 1: Resumen Ejecutivo BI ====================
    const sheet1 = workbook.addWorksheet('Resumen Ejecutivo BI');
    sheet1.columns = [{ width: 36 }, { width: 24 }, { width: 24 }, { width: 24 }];

    sheet1.mergeCells('A1:D1');
    const headerCell = sheet1.getCell('A1');
    headerCell.value = (settings.business_name || 'GastrosPOS').toUpperCase();
    headerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 30;

    sheet1.mergeCells('A2:D2');
    const subHeader = sheet1.getCell('A2');
    subHeader.value = `INFORME CONSOLIDADO DE REPORTES & BI (${startDate || 'Inicio'} al ${endDate || 'Hoy'}) - NIT: ${settings.nit || '---'}`;
    subHeader.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    subHeader.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet1.addRow([]);

    const totGross = shifts.reduce((s, x) => s + parseFloat(x.gross_revenue || 0), 0);
    const totNet = shifts.reduce((s, x) => s + parseFloat(x.net_revenue || 0), 0);
    const totTax = shifts.reduce((s, x) => s + parseFloat(x.tax_total || 0), 0);
    const totTips = shifts.reduce((s, x) => s + parseFloat(x.total_tips || 0), 0);
    const totCash = shifts.reduce((s, x) => s + parseFloat(x.cash_sales || 0), 0);
    const totCard = shifts.reduce((s, x) => s + parseFloat(x.card_sales || 0), 0);
    const totTrans = shifts.reduce((s, x) => s + parseFloat(x.transfer_sales || 0), 0);
    const totWith = shifts.reduce((s, x) => s + parseFloat(x.total_withdrawals || 0), 0);
    const totTickets = shifts.reduce((s, x) => s + parseInt(x.total_tickets || 0, 10), 0);
    const totDiff = shifts.reduce((s, x) => s + parseFloat(x.difference || 0), 0);

    const totSuppCost = suppliesData.totalSuppliesCost || 0;
    const totGrossProfit = Math.max(0, totNet - totSuppCost);
    const grossMarginPct = totNet > 0 ? ((totGrossProfit / totNet) * 100).toFixed(1) : 0;

    const rKpiTitle = sheet1.addRow(['1. MÉTRICAS GLOBALES DEL PERÍODO']);
    rKpiTitle.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const r1 = sheet1.addRow(['Total Ventas Brutas Recaudadas:', totGross, 'Total Facturas Emitidas:', totTickets]);
    const r2 = sheet1.addRow(['Ventas Netas (Sin Impuestos):', totNet, 'Total Turnos Realizados:', shifts.length]);
    const r3 = sheet1.addRow(['Impuestos Totales Recaudados:', totTax, 'Propinas Totales Recaudadas:', totTips]);
    const r4 = sheet1.addRow(['Costo Total Insumos Utilizados:', totSuppCost, 'Egresos y Retiros de Caja:', totWith]);
    const r5 = sheet1.addRow(['UTILIDAD BRUTA OPERATIVA ESTIMADA:', totGrossProfit, 'Margen Bruto Promedio:', `${grossMarginPct}%`]);
    const r6 = sheet1.addRow(['Diferencia de Arqueo Acumulada:', totDiff, 'Ticket Promedio por Factura:', totTickets > 0 ? totGross / totTickets : 0]);

    [r1, r2, r3, r4, r5, r6].forEach(r => {
      r.getCell(2).numFmt = '"$"#,##0';
      if (typeof r.getCell(4).value === 'number') r.getCell(4).numFmt = '"$"#,##0';
      r.font = { bold: true };
    });
    r5.getCell(1).font = { bold: true, color: { argb: 'FF10B981' } };
    r5.getCell(2).font = { bold: true, color: { argb: 'FF10B981' } };

    sheet1.addRow([]);

    // Medios de pago consolidado
    const rPayTitle = sheet1.addRow(['2. PARTICIPACIÓN POR MEDIOS DE PAGO']);
    rPayTitle.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblPayH = sheet1.addRow(['Medio de Pago', 'Total Recaudado', '% Participación']);
    tblPayH.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    });

    const rp1 = sheet1.addRow(['Efectivo', totCash, `${totGross > 0 ? ((totCash / totGross) * 100).toFixed(1) : 0}%`]);
    const rp2 = sheet1.addRow(['Tarjetas Crédito / Débito', totCard, `${totGross > 0 ? ((totCard / totGross) * 100).toFixed(1) : 0}%`]);
    const rp3 = sheet1.addRow(['Transferencias / Nequi / Daviplata', totTrans, `${totGross > 0 ? ((totTrans / totGross) * 100).toFixed(1) : 0}%`]);
    [rp1, rp2, rp3].forEach(r => { r.getCell(2).numFmt = '"$"#,##0'; });

    // ==================== SHEET 2: Insumos Consumidos en el Período ====================
    const sheetSupp = workbook.addWorksheet('Insumos Consumidos (Período)');
    sheetSupp.columns = [
      { header: 'Insumo / Materia Prima', key: 'name', width: 30 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Unidad de Medida', key: 'unit', width: 18 },
      { header: 'Cantidad Total Consumida', key: 'total_used', width: 26 },
      { header: 'Costo Unitario', key: 'cost_price', width: 22 },
      { header: 'Costo Total Consumido', key: 'total_cost', width: 24 },
      { header: 'Utilizado en qué Productos', key: 'used_in', width: 45 }
    ];

    sheetSupp.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    });

    suppliesData.supplies.forEach(s => {
      const usedInStr = s.used_in_products.map(p => `${p.product_name} (${p.units_sold} unids)`).join(', ');
      const row = sheetSupp.addRow({
        name: s.name,
        category: s.category,
        unit: s.unit,
        total_used: parseFloat(s.total_used.toFixed(2)),
        cost_price: parseFloat(s.cost_price || 0),
        total_cost: parseFloat(s.total_cost || 0),
        used_in: usedInStr
      });
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '"$"#,##0';
      row.getCell(6).numFmt = '"$"#,##0';
    });

    const totSuppConsRow = sheetSupp.addRow({
      name: 'TOTAL COSTO INSUMOS PERÍODO',
      total_cost: suppliesData.totalSuppliesCost
    });
    totSuppConsRow.font = { bold: true };
    totSuppConsRow.getCell(6).numFmt = '"$"#,##0';

    // ==================== SHEET 3: Productos Vendidos en el Período ====================
    const sheetProd = workbook.addWorksheet('Productos Más Vendidos');
    sheetProd.columns = [
      { header: 'Categoría', key: 'category_name', width: 22 },
      { header: 'SKU / Código', key: 'product_sku', width: 16 },
      { header: 'Nombre del Producto', key: 'product_name', width: 32 },
      { header: 'Unidades Vendidas', key: 'units_sold', width: 20 },
      { header: 'Total Recaudado', key: 'total_revenue', width: 24 },
      { header: '% Participación', key: 'share', width: 18 }
    ];

    sheetProd.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    suppliesData.productsSold.sort((a, b) => b.total_revenue - a.total_revenue).forEach(p => {
      const totRev = parseFloat(p.total_revenue || 0);
      const row = sheetProd.addRow({
        category_name: p.category_name || 'General',
        product_sku: p.product_sku || '---',
        product_name: p.product_name,
        units_sold: parseInt(p.total_units_sold || 0, 10),
        total_revenue: totRev,
        share: `${totGross > 0 ? ((totRev / totGross) * 100).toFixed(1) : 0}%`
      });
      row.getCell(5).numFmt = '"$"#,##0';
    });

    // ==================== SHEET 4: Detalle de Turnos ====================
    const sheetShifts = workbook.addWorksheet('Historial de Turnos');
    sheetShifts.columns = [
      { header: 'N° Turno', key: 'id', width: 12 },
      { header: 'Cajero / Responsable', key: 'user_name', width: 24 },
      { header: 'Nombre Turno', key: 'shift_name', width: 20 },
      { header: 'Apertura', key: 'opened_at', width: 20 },
      { header: 'Cierre', key: 'closed_at', width: 20 },
      { header: 'Base Inicial', key: 'opening_amount', width: 16 },
      { header: 'Ventas Brutas', key: 'gross_revenue', width: 18 },
      { header: 'Efectivo', key: 'cash_sales', width: 16 },
      { header: 'Tarjetas', key: 'card_sales', width: 16 },
      { header: 'Transferencias', key: 'transfer_sales', width: 16 },
      { header: 'Egresos', key: 'total_withdrawals', width: 16 },
      { header: 'Diferencia', key: 'difference', width: 16 },
      { header: 'Tickets', key: 'total_tickets', width: 12 }
    ];

    sheetShifts.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    });

    shifts.forEach(s => {
      const row = sheetShifts.addRow({
        id: s.id,
        user_name: s.user_name || '---',
        shift_name: s.shift_name || '---',
        opened_at: s.opened_at ? new Date(s.opened_at).toLocaleString() : '---',
        closed_at: s.closed_at ? new Date(s.closed_at).toLocaleString() : '---',
        opening_amount: parseFloat(s.opening_amount || 0),
        gross_revenue: parseFloat(s.gross_revenue || 0),
        cash_sales: parseFloat(s.cash_sales || 0),
        card_sales: parseFloat(s.card_sales || 0),
        transfer_sales: parseFloat(s.transfer_sales || 0),
        total_withdrawals: parseFloat(s.total_withdrawals || 0),
        difference: parseFloat(s.difference || 0),
        total_tickets: parseInt(s.total_tickets || 0, 10)
      });
      [6, 7, 8, 9, 10, 11, 12].forEach(i => { row.getCell(i).numFmt = '"$"#,##0'; });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Informe_Consolidado_BI_${startDate || 'General'}_al_${endDate || 'Hoy'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generando archivo Excel consolidado:', err);
    res.status(500).json({ error: 'Error al exportar reporte consolidado a Excel' });
  }
};

exports.getShiftSuppliesUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    let shift = await knex('shift_reports')
      .where({ business_id: businessId, id })
      .first();

    if (!shift) {
      shift = await knex('shift_reports')
        .where({ business_id: businessId, cash_register_id: id })
        .first();
    }

    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    const suppliesData = await calculateSuppliesUsageForShifts([shift.cash_register_id], businessId);

    res.json({
      shift_id: shift.id,
      shift_name: shift.shift_name,
      user_name: shift.user_name,
      total_supplies_cost: suppliesData.totalSuppliesCost,
      supplies_count: suppliesData.supplies.length,
      supplies: suppliesData.supplies,
      products_sold: suppliesData.productsSold
    });
  } catch (err) {
    console.error('Error calculando insumos por turno:', err);
    res.status(500).json({ error: 'Error al calcular insumos utilizados' });
  }
};

exports.reorderShifts = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    await knex.raw(`
      SET session_replication_role = 'replica';

      -- 1. Unificar Turno 1 (Jornada Mañana - 23 de Agosto en la mañana)
      UPDATE cash_registers SET id = 1 WHERE id IN (1, 2) AND opened_at < '2026-08-23 12:00:00+00' AND business_id = '${businessId}';
      UPDATE shift_reports SET id = 1, cash_register_id = 1 WHERE opened_at < '2026-08-23 12:00:00+00' AND business_id = '${businessId}';
      UPDATE orders SET cash_register_id = 1 WHERE cash_register_id IN (1, 2) AND business_id = '${businessId}';
      UPDATE invoices SET cash_register_id = 1 WHERE cash_register_id IN (1, 2) AND business_id = '${businessId}';
      UPDATE cash_movements SET cash_register_id = 1 WHERE cash_register_id IN (1, 2);

      -- 2. Unificar Turno 2 (Jornada Tarde / Noche - 23 de Agosto en la noche)
      UPDATE cash_registers SET id = 2 WHERE id IN (2, 3) AND opened_at >= '2026-08-23 12:00:00+00' AND business_id = '${businessId}';
      UPDATE shift_reports SET id = 2, cash_register_id = 2 WHERE opened_at >= '2026-08-23 12:00:00+00' AND business_id = '${businessId}';
      UPDATE orders SET cash_register_id = 2 WHERE cash_register_id = 3 AND business_id = '${businessId}';
      UPDATE invoices SET cash_register_id = 2 WHERE cash_register_id = 3 AND business_id = '${businessId}';
      UPDATE cash_movements SET cash_register_id = 2 WHERE cash_register_id = 3;

      -- 3. Limpiar registros sobrantes
      DELETE FROM cash_registers WHERE id NOT IN (1, 2) AND business_id = '${businessId}';
      DELETE FROM shift_reports WHERE id NOT IN (1, 2) AND business_id = '${businessId}';

      SET session_replication_role = 'origin';

      -- 4. Ajustar secuencias
      SELECT setval('cash_registers_id_seq', 2);
      SELECT setval('shift_reports_id_seq', 2);
    `);

    const updatedShifts = await knex('shift_reports')
      .where('business_id', businessId)
      .orderBy('id', 'asc');

    res.json({ message: 'Turnos renumerados exitosamente', shifts: updatedShifts });
  } catch (err) {
    console.error('Error al renumerar turnos:', err);
    res.status(500).json({ error: 'Error al renumerar turnos: ' + err.message });
  }
};
