/**
 * Reports Controller — Multi-tenant
 * Reportes de turno filtrados por branch_id, con export Excel
 */
const knex = require('../database/knex');
const ExcelJS = require('exceljs');

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

    const shift = await knex('shift_reports')
      .where('business_id', businessId)
      .andWhere(function() {
        this.where('id', id).orWhere('cash_register_id', id);
      })
      .first();

    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    // JSONB ya viene como objeto en PostgreSQL
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

    const shift = await knex('shift_reports')
      .where('business_id', businessId)
      .andWhere(function() {
        this.where('id', id).orWhere('cash_register_id', id);
      })
      .first();

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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name;
    workbook.created = new Date();

    // SHEET 1: Resumen de Turno
    const sheet1 = workbook.addWorksheet('Resumen de Turno (Reporte Z)');
    sheet1.columns = [{ width: 32 }, { width: 22 }, { width: 22 }, { width: 22 }];

    sheet1.mergeCells('A1:D1');
    const headerCell = sheet1.getCell('A1');
    headerCell.value = settings.business_name.toUpperCase();
    headerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 30;

    sheet1.mergeCells('A2:D2');
    const subHeader = sheet1.getCell('A2');
    subHeader.value = `INFORME DE CIERRE DE CAJA (TURNO N° ${shift.id}) - NIT: ${settings.nit}`;
    subHeader.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    subHeader.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet1.addRow([]);
    sheet1.addRow(['Cajero / Responsable:', shift.user_name, 'Nombre Turno:', shift.shift_name]);
    sheet1.addRow(['Apertura de Caja:', shift.opened_at, 'Cierre de Caja:', shift.closed_at]);
    sheet1.getRow(4).font = { bold: true };
    sheet1.getRow(5).font = { bold: true };
    sheet1.addRow([]);

    const rowTitle1 = sheet1.addRow(['1. CONTROL DE EFECTIVO Y ARQUEO']);
    rowTitle1.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblCashHeader = sheet1.addRow(['Base Inicial', 'Esperado en Caja', 'Declarado (Físico)', 'Diferencia / Arqueo']);
    tblCashHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'right' };
    });

    const diff = parseFloat(shift.difference);
    const cashRow = sheet1.addRow([
      parseFloat(shift.opening_amount), parseFloat(shift.expected_amount),
      parseFloat(shift.closing_amount), diff
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

    const rowTitle2 = sheet1.addRow(['2. VENTAS Y MEDIOS DE PAGO']);
    rowTitle2.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblPayHeader = sheet1.addRow(['Medio de Pago', 'Monto Total Recaudado', '% del Total', 'Comprobantes']);
    tblPayHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    });

    const gr = parseFloat(shift.gross_revenue);
    const cs = parseFloat(shift.cash_sales);
    const cas = parseFloat(shift.card_sales);
    const ts = parseFloat(shift.transfer_sales);

    sheet1.addRow(['Efectivo (Ventas)', cs, `${gr > 0 ? ((cs / gr) * 100).toFixed(1) : 0}%`, '---']);
    sheet1.addRow(['Tarjeta Crédito/Débito', cas, `${gr > 0 ? ((cas / gr) * 100).toFixed(1) : 0}%`, '---']);
    sheet1.addRow(['Transferencia / Nequi', ts, `${gr > 0 ? ((ts / gr) * 100).toFixed(1) : 0}%`, '---']);

    const rowTotPay = sheet1.addRow(['TOTAL VENTAS BRUTAS', gr, '100.0%', shift.total_tickets]);
    rowTotPay.font = { bold: true };

    sheet1.addRow([]);

    const rowTitle3 = sheet1.addRow(['3. IMPUESTOS, PROPINAS Y SALIDAS DE DINERO']);
    rowTitle3.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    sheet1.addRow(['Ventas Netas (Sin Impuestos):', parseFloat(shift.net_revenue), 'Impuestos Recaudados:', parseFloat(shift.tax_total)]);
    sheet1.addRow(['Propinas Recaudadas:', parseFloat(shift.total_tips), 'Egresos y Retiros:', parseFloat(shift.total_withdrawals)]);
    sheet1.addRow(['Valor en Anulaciones:', parseFloat(shift.total_voids), '', '']);

    // SHEET 2: Historial de Transacciones
    const sheet2 = workbook.addWorksheet('Historial de Transacciones');
    sheet2.columns = [
      { header: 'N° Factura', key: 'invoice_number', width: 24 },
      { header: 'Fecha y Hora', key: 'created_at', width: 22 },
      { header: 'Mesa', key: 'table_number', width: 14 },
      { header: 'Mesero', key: 'waiter_name', width: 22 },
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
        created_at: inv.created_at,
        table_number: inv.table_number || `Mesa ${inv.table_id}`,
        waiter_name: inv.waiter_name || 'Mesero',
        payment_method: inv.payment_method?.toUpperCase(),
        subtotal: parseFloat(inv.subtotal),
        tax_total: parseFloat(inv.tax_total),
        tip_amount: parseFloat(inv.tip_amount),
        total: parseFloat(inv.total)
      });
      [6, 7, 8, 9].forEach(i => { row.getCell(i).numFmt = '"$"#,##0'; });
    });

    // SHEET 3: Ventas por Producto
    const sheet3 = workbook.addWorksheet('Ventas por Producto');
    sheet3.columns = [
      { header: 'Categoría', key: 'category_name', width: 20 },
      { header: 'Nombre del Producto', key: 'product_name', width: 30 },
      { header: 'Unidades Vendidas', key: 'quantity', width: 18 },
      { header: 'Precio Unitario Promedio', key: 'unit_price', width: 22 },
      { header: 'Total Recaudado', key: 'total_sales', width: 22 }
    ];

    sheet3.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    (snapshot.itemizedSales || []).forEach(item => {
      const row = sheet3.addRow({
        category_name: item.category_name,
        product_name: item.product_name,
        quantity: parseInt(item.quantity),
        unit_price: parseFloat(item.unit_price),
        total_sales: parseFloat(item.total_sales)
      });
      row.getCell(4).numFmt = '"$"#,##0';
      row.getCell(5).numFmt = '"$"#,##0';
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Z_Turno_${shift.id}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generando archivo Excel:', err);
    res.status(500).json({ error: 'Error al exportar reporte Excel' });
  }
};

/**
 * Obtener desglose de insumos consumidos en el turno por productos vendidos
 */
exports.getShiftSuppliesUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req.tenant;

    const shift = await knex('shift_reports')
      .where('business_id', businessId)
      .andWhere(function() {
        this.where('id', id).orWhere('cash_register_id', id);
      })
      .first();

    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    const cashRegisterId = shift.cash_register_id;

    // Obtener todas las facturas y sus items de ese turno
    const orderItems = await knex('order_items as oi')
      .join('invoices as inv', 'oi.order_id', 'inv.order_id')
      .join('products as p', 'oi.product_id', 'p.id')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .select(
        'oi.product_id',
        'p.name as product_name',
        'c.name as category_name',
        knex.raw('SUM(oi.quantity)::float as total_units_sold'),
        knex.raw('SUM(oi.quantity * oi.unit_price)::float as total_revenue')
      )
      .where('inv.cash_register_id', cashRegisterId)
      .andWhere('inv.business_id', businessId)
      .groupBy('oi.product_id', 'p.name', 'c.name');

    // Mapear recetas e insumos
    const suppliesMap = {};
    let totalSuppliesCost = 0;

    for (const item of orderItems) {
      // Buscar receta del producto
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

    res.json({
      shift_id: shift.id,
      shift_name: shift.shift_name,
      user_name: shift.user_name,
      total_supplies_cost: totalSuppliesCost,
      supplies_count: suppliesList.length,
      supplies: suppliesList,
      products_sold: orderItems
    });
  } catch (err) {
    console.error('Error calculando insumos por turno:', err);
    res.status(500).json({ error: 'Error al calcular insumos utilizados' });
  }
};

