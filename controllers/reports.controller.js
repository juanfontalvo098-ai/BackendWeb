const db = require('../database/connection');
const ExcelJS = require('exceljs');

exports.getShifts = (req, res) => {
  try {
    const { startDate, endDate, user_id } = req.query;

    let sql = 'SELECT id, cash_register_id, user_id, user_name, shift_name, opened_at, closed_at, opening_amount, closing_amount, expected_amount, difference, gross_revenue, net_revenue, tax_total, total_tips, total_tickets, cash_sales, card_sales, transfer_sales, total_withdrawals, total_voids, created_at FROM shift_reports WHERE 1=1';
    let params = [];

    if (startDate && endDate) {
      sql += ' AND DATE(closed_at) BETWEEN DATE(?) AND DATE(?)';
      params.push(startDate, endDate);
    }
    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }

    sql += ' ORDER BY id DESC';

    const shifts = db.prepare(sql).all(...params);
    res.json(shifts);
  } catch (err) {
    console.error('Error obteniendo informe de turnos:', err);
    res.status(500).json({ error: 'Error al consultar historial de turnos' });
  }
};

exports.getShiftById = (req, res) => {
  try {
    const { id } = req.params;
    const shift = db.prepare('SELECT * FROM shift_reports WHERE id = ? OR cash_register_id = ?').get(id, id);
    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    try {
      shift.snapshot = JSON.parse(shift.snapshot_json);
    } catch (e) {
      shift.snapshot = { invoices: [], itemizedSales: [], movements: [] };
    }
    delete shift.snapshot_json;

    res.json(shift);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener detalle de turno' });
  }
};

exports.exportShiftExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const shift = db.prepare('SELECT * FROM shift_reports WHERE id = ? OR cash_register_id = ?').get(id, id);
    if (!shift) return res.status(404).json({ error: 'Informe de turno no encontrado' });

    let snapshot = { invoices: [], itemizedSales: [], movements: [] };
    try {
      snapshot = JSON.parse(shift.snapshot_json);
    } catch (e) {}

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {
      business_name: 'GastrosPOS Enterprise', nit: '900.123.456-7'
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.business_name;
    workbook.created = new Date();

    // -------------------------------------------------------------
    // SHEET 1: Shift Summary (Resumen Financiero y Control de Caja)
    // -------------------------------------------------------------
    const sheet1 = workbook.addWorksheet('Resumen de Turno (Reporte Z)');

    // Formateo de columnas
    sheet1.columns = [
      { width: 32 },
      { width: 22 },
      { width: 22 },
      { width: 22 }
    ];

    // Encabezado del Negocio
    sheet1.mergeCells('A1:D1');
    const headerCell = sheet1.getCell('A1');
    headerCell.value = settings.business_name.toUpperCase();
    headerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 30;

    sheet1.mergeCells('A2:D2');
    const subHeader = sheet1.getCell('A2');
    subHeader.value = `INFORME Z DE CIERRE DE CAJA (TURNO N° ${shift.id}) - NIT: ${settings.nit}`;
    subHeader.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    subHeader.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet1.addRow([]); // Fila vacía

    // Datos del Turno
    sheet1.addRow(['Cajero / Responsable:', shift.user_name, 'Nombre Turno:', shift.shift_name]);
    sheet1.addRow(['Apertura de Caja:', shift.opened_at, 'Cierre de Caja:', shift.closed_at]);
    
    sheet1.getRow(4).font = { bold: true };
    sheet1.getRow(5).font = { bold: true };
    sheet1.addRow([]);

    // SECCIÓN 1: Control de Efectivo en Caja
    const rowTitle1 = sheet1.addRow(['1. CONTROL DE EFECTIVO Y ARQUEO']);
    rowTitle1.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
    
    const tblCashHeader = sheet1.addRow(['Base Inicial', 'Esperado en Caja', 'Declarado (Físico)', 'Diferencia / Arqueo']);
    tblCashHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'right' };
    });

    const cashRow = sheet1.addRow([shift.opening_amount, shift.expected_amount, shift.closing_amount, shift.difference]);
    cashRow.eachCell((cell, colNumber) => {
      cell.numFmt = '"$"#,##0';
      cell.alignment = { horizontal: 'right' };
      cell.font = { bold: true };
      if (colNumber === 4) {
        cell.font = { bold: true, color: { argb: shift.difference < 0 ? 'FED1D5DB' : 'FF16A34A' } };
      }
    });

    sheet1.addRow([]);

    // SECCIÓN 2: Ventas por Método de Pago
    const rowTitle2 = sheet1.addRow(['2. VENTAS Y MEDIOS DE PAGO']);
    rowTitle2.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    const tblPayHeader = sheet1.addRow(['Medio de Pago', 'Monto Total Recaudado', '% del Total', 'Comprobantes']);
    tblPayHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    });

    sheet1.addRow(['Efectivo (Ventas)', shift.cash_sales, `${shift.gross_revenue > 0 ? ((shift.cash_sales / shift.gross_revenue) * 100).toFixed(1) : 0}%`, '---']);
    sheet1.addRow(['Tarjeta Crédito/Débito', shift.card_sales, `${shift.gross_revenue > 0 ? ((shift.card_sales / shift.gross_revenue) * 100).toFixed(1) : 0}%`, '---']);
    sheet1.addRow(['Transferencia / Nequi', shift.transfer_sales, `${shift.gross_revenue > 0 ? ((shift.transfer_sales / shift.gross_revenue) * 100).toFixed(1) : 0}%`, '---']);
    
    const rowTotPay = sheet1.addRow(['TOTAL VENTAS BRUTAS', shift.gross_revenue, '100.0%', shift.total_tickets]);
    rowTotPay.font = { bold: true };

    for (let r = 13; r <= 16; r++) {
      sheet1.getCell(`B${r}`).numFmt = '"$"#,##0';
    }

    sheet1.addRow([]);

    // SECCIÓN 3: Resumen Fiscal y Salidas
    const rowTitle3 = sheet1.addRow(['3. IMPUESTOS, PROPINAS Y SALIDAS DE DINERO']);
    rowTitle3.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };

    sheet1.addRow(['Ventas Netas (Sin Impuestos):', shift.net_revenue, 'Impuestos Recaudados (IVA/Impoconsumo):', shift.tax_total]);
    sheet1.addRow(['Propinas Recaudadas:', shift.total_tips, 'Egresos y Retiros de Caja:', shift.total_withdrawals]);
    sheet1.addRow(['Valor en Anulaciones / Cancelaciones:', shift.total_voids, '', '']);

    for (let r = 19; r <= 21; r++) {
      sheet1.getCell(`B${r}`).numFmt = '"$"#,##0';
      sheet1.getCell(`D${r}`).numFmt = '"$"#,##0';
    }

    // -------------------------------------------------------------
    // SHEET 2: Transactions Log (Historial de Transacciones del Turno)
    // -------------------------------------------------------------
    const sheet2 = workbook.addWorksheet('Historial de Transacciones');
    sheet2.columns = [
      { header: 'N° Factura', key: 'invoice_number', width: 20 },
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
        subtotal: inv.subtotal,
        tax_total: inv.tax_total,
        tip_amount: inv.tip_amount,
        total: inv.total
      });

      row.getCell(6).numFmt = '"$"#,##0';
      row.getCell(7).numFmt = '"$"#,##0';
      row.getCell(8).numFmt = '"$"#,##0';
      row.getCell(9).numFmt = '"$"#,##0';
    });

    // -------------------------------------------------------------
    // SHEET 3: Itemized Sales (Consolidado de Productos Vendidos)
    // -------------------------------------------------------------
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
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_sales: item.total_sales
      });

      row.getCell(4).numFmt = '"$"#,##0';
      row.getCell(5).numFmt = '"$"#,##0';
    });

    // Transmitir respuesta binaria Excel (.xlsx)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Z_Turno_${shift.id}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generando archivo Excel de reporte Z:', err);
    res.status(500).json({ error: 'Error al exportar reporte Excel' });
  }
};
