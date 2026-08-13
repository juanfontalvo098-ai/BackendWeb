/**
 * Invoices Controller — Multi-tenant
 * Facturación filtrada por branch_id con número de factura que incluye código de sucursal
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('invoices as i')
      .join('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .join('orders as o', 'i.order_id', 'o.id')
      .join('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .select('i.*', 'u_cashier.full_name as cashier_name', 'u_waiter.full_name as waiter_name', 't.table_number')
      .where('i.business_id', businessId);

    if (branchId && !isGlobalScope) {
      query.andWhere('i.branch_id', branchId);
    }

    const invoices = await query.orderBy('i.id', 'desc');

    for (const inv of invoices) {
      inv.items = await knex('order_items as oi')
        .join('products as p', 'oi.product_id', 'p.id')
        .select('oi.*', 'p.name')
        .where('oi.order_id', inv.order_id);
    }

    res.json(invoices);
  } catch (err) {
    console.error('Error al obtener facturas:', err);
    res.status(500).json({ error: 'Error al consultar historial de facturas' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const invoice = await knex('invoices as i')
      .join('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .join('orders as o', 'i.order_id', 'o.id')
      .join('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .select('i.*', 'u_cashier.full_name as cashier_name', 'u_waiter.full_name as waiter_name', 't.table_number')
      .where({ 'i.id': req.params.id, 'i.business_id': businessId })
      .first();

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', invoice.order_id);

    res.json({ ...invoice, items });
  } catch (err) {
    console.error('Error al obtener factura:', err);
    res.status(500).json({ error: 'Error al consultar detalle de factura' });
  }
};

exports.getPrintFormat = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const invoice = await knex('invoices as i')
      .join('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .join('orders as o', 'i.order_id', 'o.id')
      .join('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .select('i.*', 'u_cashier.full_name as cashier_name', 'u_waiter.full_name as waiter_name', 't.table_number')
      .where({ 'i.id': req.params.id, 'i.business_id': businessId })
      .first();

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', invoice.order_id);

    res.json({ ...invoice, items });
  } catch (err) {
    console.error('Error al obtener formato de impresión:', err);
    res.status(500).json({ error: 'Error al consultar formato de impresión' });
  }
};

exports.create = async (req, res) => {
  const { order_id, tip_percentage, custom_tip_amount, payment_method } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  try {
    const register = await knex('cash_registers')
      .where({ user_id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(400).json({ error: 'Debes abrir una caja antes de poder facturar' });

    const order = await knex('orders')
      .where({ id: order_id, business_id: businessId })
      .first();
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'cerrada') return res.status(400).json({ error: 'La orden ya está cerrada' });

    const items = await knex('order_items')
      .select('quantity', 'unit_price', 'tax_rate', 'tax_included')
      .where('order_id', order_id);
    if (items.length === 0) return res.status(400).json({ error: 'La orden no tiene ítems' });

    let subtotal = 0, tax_total = 0;

    items.forEach(item => {
      const rate = parseFloat(item.tax_rate || 0);
      const lineTotal = parseInt(item.quantity) * parseFloat(item.unit_price);
      if (item.tax_included && rate > 0) {
        const itemSub = lineTotal / (1 + rate);
        subtotal += itemSub;
        tax_total += (lineTotal - itemSub);
      } else if (!item.tax_included && rate > 0) {
        subtotal += lineTotal;
        tax_total += (lineTotal * rate);
      } else {
        subtotal += lineTotal;
      }
    });

    const total_before_tip = subtotal + tax_total;

    let tip_amount = 0;
    if (custom_tip_amount !== undefined && custom_tip_amount !== null && parseFloat(custom_tip_amount) >= 0) {
      tip_amount = parseFloat(custom_tip_amount);
    } else {
      tip_amount = total_before_tip * (tip_percentage || 0);
    }

    const total = total_before_tip + tip_amount;

    // Generar número de factura con código de sucursal
    const branch = await knex('branches').where('id', branchId).first();
    const branchCode = branch ? branch.code.replace(/-/g, '') : 'GEN';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randStr = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `POS-${branchCode}-${dateStr}-${randStr}`;

    const invoiceId = await knex.transaction(async (trx) => {
      const [invoiceInfo] = await trx('invoices').insert({
        business_id: businessId,
        branch_id: branchId,
        order_id,
        cash_register_id: register.id,
        user_id,
        subtotal,
        tax_total,
        tip_percentage: tip_percentage || 0,
        tip_amount,
        total,
        payment_method,
        invoice_number
      }).returning('id');

      await trx('cash_movements').insert({
        cash_register_id: register.id,
        type: 'venta',
        amount: total,
        payment_method,
        description: `Factura ${invoice_number}`
      });

      await trx('orders').where('id', order_id).update({ status: 'cerrada', updated_at: knex.fn.now() });
      await trx('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });

      return invoiceInfo.id;
    });

    if (req.app.locals.io) {
      req.app.locals.io.to(`branch:${branchId}`).emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
      req.app.locals.io.to(`branch:${branchId}`).emit('order:updated', { order_id });
    }

    // Obtener factura completa para retornar
    const invoice = await knex('invoices as i')
      .join('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .join('orders as o', 'i.order_id', 'o.id')
      .join('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .join('tables_restaurant as t', 'o.table_id', 't.id')
      .select('i.*', 'u_cashier.full_name as cashier_name', 'u_waiter.full_name as waiter_name', 't.table_number')
      .where('i.id', invoiceId)
      .first();

    const invoiceItems = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', order_id);

    res.status(201).json({ ...invoice, items: invoiceItems });
  } catch (err) {
    console.error('Error al generar factura:', err);
    res.status(500).json({ error: 'Error al generar factura', details: err.message });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const { businessId } = req.tenant;

  try {
    const invoice = await knex('invoices')
      .where({ id, business_id: businessId })
      .first();
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    await knex.transaction(async (trx) => {
      await trx('cash_movements')
        .where('cash_register_id', invoice.cash_register_id)
        .andWhere('description', 'like', `%Factura ${invoice.invoice_number}%`)
        .del();

      await trx('orders').where('id', invoice.order_id).update({
        status: 'cancelada',
        notes: reason ? `Factura Anulada: ${reason}` : 'Factura Anulada/Eliminada'
      });

      await trx('invoices').where('id', id).del();
    });

    if (req.app.locals.io) {
      req.app.locals.io.to(`branch:${invoice.branch_id}`).emit('order:updated', { order_id: invoice.order_id });
    }

    res.json({ message: 'Factura eliminada / anulada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar factura:', err);
    res.status(500).json({ error: 'Error al eliminar la factura' });
  }
};
