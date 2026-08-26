const knex = require('../database/knex');
const { deductStockForInvoice } = require('./inventory.controller');

exports.getAll = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('invoices as i')
      .leftJoin('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .leftJoin('orders as o', 'i.order_id', 'o.id')
      .leftJoin('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('customers as c', 'i.customer_id', 'c.id')
      .leftJoin('accounts_receivable as ar', 'i.id', 'ar.invoice_id')
      .select(
        'i.*',
        'o.order_type as order_type',
        'o.delivery_address as delivery_address',
        'o.delivery_phone as delivery_phone',
        'o.delivery_notes as delivery_notes',
        'u_cashier.full_name as cashier_name',
        'u_waiter.full_name as waiter_name',
        't.table_number',
        'c.name as customer_name',
        'c.document_type as customer_doc_type',
        'c.document_number as customer_document',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.city as customer_city',
        'c.email as customer_email',
        'ar.amount as credit_amount',
        'ar.paid_amount as credit_paid_amount',
        'ar.balance as credit_balance',
        'ar.due_date as credit_due_date',
        'ar.status as credit_status'
      )
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
      .leftJoin('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .leftJoin('orders as o', 'i.order_id', 'o.id')
      .leftJoin('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('customers as c', 'i.customer_id', 'c.id')
      .leftJoin('accounts_receivable as ar', 'i.id', 'ar.invoice_id')
      .select(
        'i.*',
        'o.order_type as order_type',
        'o.delivery_address as delivery_address',
        'o.delivery_phone as delivery_phone',
        'o.delivery_notes as delivery_notes',
        'u_cashier.full_name as cashier_name',
        'u_waiter.full_name as waiter_name',
        't.table_number',
        'c.name as customer_name',
        'c.document_type as customer_doc_type',
        'c.document_number as customer_document',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.city as customer_city',
        'c.email as customer_email',
        'ar.amount as credit_amount',
        'ar.paid_amount as credit_paid_amount',
        'ar.balance as credit_balance',
        'ar.due_date as credit_due_date',
        'ar.status as credit_status'
      )
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

    let query = knex('invoices as i')
      .leftJoin('users as u_cashier', 'i.user_id', 'u_cashier.id')
      .leftJoin('orders as o', 'i.order_id', 'o.id')
      .leftJoin('users as u_waiter', 'o.user_id', 'u_waiter.id')
      .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
      .leftJoin('customers as c', 'i.customer_id', 'c.id')
      .leftJoin('accounts_receivable as ar', 'i.id', 'ar.invoice_id')
      .select(
        'i.*',
        'o.order_type as order_type',
        'o.delivery_address as delivery_address',
        'o.delivery_phone as delivery_phone',
        'o.delivery_notes as delivery_notes',
        'u_cashier.full_name as cashier_name',
        'u_waiter.full_name as waiter_name',
        't.table_number',
        'c.name as customer_name',
        'c.document_type as customer_doc_type',
        'c.document_number as customer_document',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.city as customer_city',
        'c.email as customer_email',
        'ar.amount as credit_amount',
        'ar.paid_amount as credit_paid_amount',
        'ar.balance as credit_balance',
        'ar.due_date as credit_due_date',
        'ar.status as credit_status'
      )
      .where('i.id', req.params.id);

    if (businessId) {
      query = query.andWhere('i.business_id', businessId);
    }

    let invoice = await query.first();
    if (!invoice) {
      invoice = await knex('invoices as i')
        .leftJoin('users as u_cashier', 'i.user_id', 'u_cashier.id')
        .leftJoin('orders as o', 'i.order_id', 'o.id')
        .select('i.*', 'o.order_type', 'u_cashier.full_name as cashier_name')
        .where('i.id', req.params.id)
        .first();
    }

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', invoice.order_id);

    // Obtener configuración del negocio para impresión
    const bId = invoice.business_id || businessId;
    let settings = null;
    if (invoice.branch_id) {
      settings = await knex('settings').where({ business_id: bId, branch_id: invoice.branch_id }).first();
    }
    if (!settings) {
      settings = await knex('settings').where({ business_id: bId }).whereNull('branch_id').first();
    }
    if (!settings) {
      settings = await knex('settings').where({ business_id: bId }).first();
    }

    res.json({ ...invoice, items, settings });
  } catch (err) {
    console.error('Error al obtener formato de impresión:', err);
    res.status(500).json({ error: 'Error al consultar formato de impresión' });
  }
};

exports.create = async (req, res) => {
  const {
    order_id, tip_percentage, custom_tip_amount,
    payment_method, customer_id, discount_amount, notes
  } = req.body;
  const { businessId, branchId } = req.tenant;
  const user_id = req.user.id;

  try {
    const register = await knex('cash_registers')
      .where({ user_id, status: 'abierta', branch_id: branchId })
      .first()
      || await knex('cash_registers')
        .where({ status: 'abierta', branch_id: branchId })
        .orderBy('id', 'desc')
        .first()
        || await knex('cash_registers')
        .where({ status: 'abierta', business_id: businessId })
        .orderBy('id', 'desc')
        .first();

    if (!register) return res.status(400).json({ error: 'Debes abrir una caja antes de poder facturar' });

    const order = await knex('orders')
      .where({ id: order_id, business_id: businessId })
      .first();
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'cerrada') return res.status(400).json({ error: 'La orden ya está cerrada' });

    const effectiveBranchId = branchId || order.branch_id || register.branch_id;

    const items = await knex('order_items')
      .select('order_id', 'product_id', 'quantity', 'unit_price', 'tax_rate', 'tax_included')
      .where('order_id', order_id);
    if (items.length === 0) return res.status(400).json({ error: 'La orden no tiene ítems' });

    let subtotal = 0, tax_total = 0;

    items.forEach(item => {
      const rate = parseFloat(item.tax_rate || 0);
      const qty = parseFloat(item.quantity) || 1;
      const lineTotal = qty * parseFloat(item.unit_price || 0);
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

    const parsedDiscount = parseFloat(discount_amount || order.discount_amount || 0);
    const parsedDeliveryFee = parseFloat(req.body.delivery_fee !== undefined ? req.body.delivery_fee : (order.delivery_fee || 0));
    const subtotalAfterDiscount = Math.max(0, subtotal - parsedDiscount);
    const total_before_tip = subtotalAfterDiscount + tax_total;

    let tip_amount = 0;
    if (payment_method === 'credito') {
      tip_amount = 0;
    } else if (custom_tip_amount !== undefined && custom_tip_amount !== null && parseFloat(custom_tip_amount) >= 0) {
      tip_amount = parseFloat(custom_tip_amount);
    } else {
      tip_amount = total_before_tip * (tip_percentage || 0);
    }

    const net_mandatory_total = total_before_tip + parsedDeliveryFee;
    const total = net_mandatory_total + tip_amount;
    const finalCustomerId = customer_id || order.customer_id || null;

    const parsedAmountPaid = (req.body.amount_paid !== undefined && req.body.amount_paid !== null && parseFloat(req.body.amount_paid) > 0)
      ? Math.max(0, parseFloat(req.body.amount_paid))
      : (payment_method === 'credito' ? 0 : total);
    const parsedCreditAmount = req.body.credit_amount !== undefined ? Math.max(0, parseFloat(req.body.credit_amount)) : (payment_method === 'credito' ? net_mandatory_total : 0);
    const parsedCreditDueDate = req.body.credit_due_date || null;

    const parsedOrderId = parseInt(order_id, 10) || order.id;
    const targetOrderStatus = parsedCreditAmount > 0 ? 'pendiente_pago' : 'cerrada';

    // Generar número de factura único, secuencial y exclusivo por negocio/sucursal
    let settings = null;
    if (effectiveBranchId) {
      settings = await knex('settings')
        .where({ business_id: businessId, branch_id: effectiveBranchId })
        .first();
    }
    if (!settings) {
      settings = await knex('settings')
        .where({ business_id: businessId })
        .whereNull('branch_id')
        .first();
    }
    if (!settings) {
      settings = await knex('settings')
        .where({ business_id: businessId })
        .first();
    }

    const business = await knex('businesses').where({ id: businessId }).first();

    // Prefijo configurable o derivado del negocio
    let prefix = 'FAC';
    if (settings && settings.invoice_prefix && settings.invoice_prefix.trim()) {
      prefix = settings.invoice_prefix.trim().toUpperCase();
    } else if (business && business.slug) {
      const cleanSlug = business.slug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      prefix = cleanSlug.length <= 4 ? cleanSlug : cleanSlug.substring(0, 4);
    }

    const branches = await knex('branches').where({ business_id: businessId });
    const isMultiBranch = Array.isArray(branches) && branches.length > 1;
    const branchPrefix = isMultiBranch && effectiveBranchId ? `B${effectiveBranchId.toString().slice(0, 4)}-` : '';

    let invQuery = knex('invoices').where('business_id', businessId);
    if (effectiveBranchId) {
      invQuery = invQuery.andWhere('branch_id', effectiveBranchId);
    }
    const invCountRes = await invQuery.count('id as total');
    let seq = (invCountRes && invCountRes[0] ? parseInt(invCountRes[0].total, 10) : 0) + 1;
    let invoice_number = `${prefix}-${branchPrefix}${String(seq).padStart(4, '0')}`;

    // Validar colisión para garantizar unicidad estricta por negocio
    let existingInv = await knex('invoices').where({ business_id: businessId, invoice_number }).first();
    while (existingInv) {
      seq++;
      invoice_number = `${prefix}-${branchPrefix}${String(seq).padStart(4, '0')}`;
      existingInv = await knex('invoices').where({ business_id: businessId, invoice_number }).first();
    }

    const parsedCash = parseFloat(req.body.cash_amount || 0);
    const parsedTransfer = parseFloat(req.body.transfer_amount || 0);
    const parsedCard = parseFloat(req.body.card_amount || 0);
    const parsedTendered = parseFloat(req.body.amount_tendered || 0);
    const parsedChange = parseFloat(req.body.change_given || 0);

    const isMixed = payment_method === 'mixto' || (parsedCash > 0 && (parsedTransfer > 0 || parsedCard > 0));
    const effectivePaymentMethod = isMixed 
      ? (parsedCreditAmount > 0 ? 'mixto + crédito' : 'mixto')
      : (parsedCreditAmount > 0 && parsedAmountPaid > 0 ? `${payment_method} + crédito` : payment_method);

    const finalCashAmount = isMixed ? parsedCash : (payment_method === 'efectivo' ? parsedAmountPaid : 0);
    const finalTransferAmount = isMixed ? parsedTransfer : (payment_method === 'transferencia' ? parsedAmountPaid : 0);
    const finalCardAmount = isMixed ? parsedCard : (payment_method === 'tarjeta' ? parsedAmountPaid : 0);

    let createdInvoiceRow = null;
    const invoiceId = await knex.transaction(async (trx) => {
      const insertedRows = await trx('invoices').insert({
        business_id: businessId,
        branch_id: effectiveBranchId,
        order_id: parsedOrderId,
        cash_register_id: register.id,
        user_id,
        customer_id: finalCustomerId,
        subtotal: subtotalAfterDiscount,
        tax_total,
        tip_percentage: tip_percentage || 0,
        tip_amount,
        discount_amount: parsedDiscount,
        delivery_fee: parsedDeliveryFee,
        total,
        payment_method: effectivePaymentMethod,
        cash_amount: finalCashAmount,
        transfer_amount: finalTransferAmount,
        card_amount: finalCardAmount,
        amount_tendered: parsedTendered,
        change_given: parsedChange,
        invoice_number,
        notes: notes || null
      }).returning('*');

      const invoiceInfo = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
      createdInvoiceRow = invoiceInfo;
      const createdInvoiceId = invoiceInfo?.id || (typeof invoiceInfo === 'number' ? invoiceInfo : (invoiceInfo && typeof invoiceInfo === 'object' ? invoiceInfo.id : null));

      if (!createdInvoiceId) {
        throw new Error('No se pudo registrar la factura en la base de datos');
      }

      // 1. Movimientos de caja si hubo abono/pago inmediato
      if (isMixed) {
        if (finalCashAmount > 0) {
          await trx('cash_movements').insert({
            cash_register_id: register.id,
            type: 'venta',
            amount: finalCashAmount,
            payment_method: 'efectivo',
            description: `Factura ${invoice_number} (Pago Mixto - Efectivo)`
          });
        }
        if (finalTransferAmount > 0) {
          await trx('cash_movements').insert({
            cash_register_id: register.id,
            type: 'venta',
            amount: finalTransferAmount,
            payment_method: 'transferencia',
            description: `Factura ${invoice_number} (Pago Mixto - Transferencia)`
          });
        }
        if (finalCardAmount > 0) {
          await trx('cash_movements').insert({
            cash_register_id: register.id,
            type: 'venta',
            amount: finalCardAmount,
            payment_method: 'tarjeta',
            description: `Factura ${invoice_number} (Pago Mixto - Tarjeta)`
          });
        }
      } else if (parsedAmountPaid > 0 && payment_method !== 'credito') {
        await trx('cash_movements').insert({
          cash_register_id: register.id,
          type: 'venta',
          amount: parsedAmountPaid,
          payment_method,
          description: `Factura ${invoice_number} ${parsedCreditAmount > 0 ? '(Abono parcial + saldo a crédito)' : (order.order_type === 'delivery' ? '(Domicilio)' : '')}`
        });
      }

      // 2. Si hay saldo a crédito (total o parcial), registrar en Cartera de Clientes (CxC)
      if (parsedCreditAmount > 0 && finalCustomerId) {
        let dueDateStr = parsedCreditDueDate;
        if (!dueDateStr) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30); // 30 días default
          dueDateStr = dueDate.toISOString().slice(0, 10);
        }

        await trx('accounts_receivable').insert({
          business_id: businessId,
          branch_id: effectiveBranchId,
          customer_id: finalCustomerId,
          invoice_id: createdInvoiceId,
          amount: parsedCreditAmount,
          paid_amount: 0,
          balance: parsedCreditAmount,
          due_date: dueDateStr,
          status: 'pendiente',
          notes: `Crédito por factura ${invoice_number}${parsedAmountPaid > 0 ? ` (Abonado: $${parsedAmountPaid})` : ''}`
        });

        // Aumentar saldo de deuda utilizado del cliente
        await trx('customers')
          .where('id', finalCustomerId)
          .increment('credit_balance', parsedCreditAmount);
      } else if (payment_method === 'credito' && finalCustomerId) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await trx('accounts_receivable').insert({
          business_id: businessId,
          branch_id: effectiveBranchId,
          customer_id: finalCustomerId,
          invoice_id: createdInvoiceId,
          amount: total,
          paid_amount: 0,
          balance: total,
          due_date: dueDate.toISOString().slice(0, 10),
          status: 'pendiente',
          notes: `Crédito por factura ${invoice_number}`
        });

        await trx('customers')
          .where('id', finalCustomerId)
          .increment('credit_balance', total);
      }

      // 3. Fidelización: Puntos de cliente (1 punto por cada $1000)
      if (finalCustomerId && total > 0) {
        const earnedPoints = Math.floor(total / 1000);
        if (earnedPoints > 0) {
          await trx('customers')
            .where('id', finalCustomerId)
            .increment('loyalty_points', earnedPoints);
        }
      }

      // 3. Descontar inventario automáticamente
      try {
        await deductStockForInvoice(trx, businessId, effectiveBranchId, items, user_id);
      } catch (invErr) {
        console.warn('Advertencia al descontar inventario:', invErr.message);
      }

      // 4. Actualizar estado de orden (si hay saldo a crédito pendiente queda 'pendiente_pago', si se pagó completa 'cerrada')
      await trx('orders').where('id', parsedOrderId).update({
        status: targetOrderStatus,
        customer_id: finalCustomerId,
        delivery_fee: parsedDeliveryFee,
        cash_register_id: register.id,
        updated_at: trx.fn.now()
      });

      if (order.table_id) {
        await trx('tables_restaurant').where('id', order.table_id).update({ status: 'libre' });
      }

      await trx('delivery_assignments').where('order_id', parsedOrderId).update({
        status: 'entregado',
        delivered_at: trx.fn.now()
      });

      // 5. Generar asiento contable automático si existe plan de cuentas
      try {
        const coaCount = await trx('chart_of_accounts').where('business_id', businessId).count('id as count').first();
        if (parseInt(coaCount.count) > 0) {
          const cajaAccount = await trx('chart_of_accounts').where({ business_id: businessId, code: '1.1.01' }).first();
          const cxcAccount = await trx('chart_of_accounts').where({ business_id: businessId, code: '1.1.03' }).first();
          const ventasAccount = await trx('chart_of_accounts').where({ business_id: businessId, code: '4.1.01' }).first();
          const ivaAccount = await trx('chart_of_accounts').where({ business_id: businessId, code: '2.1.02' }).first();
          const deliveryIncomeAccount = await trx('chart_of_accounts').where({ business_id: businessId, code: '4.1.03' }).first();

          const debitAccount = payment_method === 'credito' ? (cxcAccount || cajaAccount) : (cajaAccount || cxcAccount);

          if (debitAccount && ventasAccount) {
            const count = await trx('journal_entries').where('business_id', businessId).count('id as c').first();
            const entryNum = `AD-${String(parseInt(count.c) + 1).padStart(6, '0')}`;

            const [jEntry] = await trx('journal_entries').insert({
              business_id: businessId,
              branch_id: effectiveBranchId,
              entry_number: entryNum,
              entry_date: new Date().toISOString().slice(0, 10),
              description: `Venta Factura ${invoice_number}`,
              reference_type: 'invoice',
              reference_id: createdInvoiceId,
              status: 'aprobado',
              user_id
            }).returning('*');

            // Débito a Caja o CxC
            await trx('journal_entry_lines').insert({
              journal_entry_id: jEntry.id,
              account_id: debitAccount.id,
              debit: total,
              credit: 0,
              description: `Cobro Factura ${invoice_number}`
            });

            // Crédito a Ingresos por Ventas de Productos
            await trx('journal_entry_lines').insert({
              journal_entry_id: jEntry.id,
              account_id: ventasAccount.id,
              debit: 0,
              credit: subtotalAfterDiscount,
              description: `Ingreso por Ventas de Productos`
            });

            // Crédito a IVA por Pagar
            if (tax_total > 0 && ivaAccount) {
              await trx('journal_entry_lines').insert({
                journal_entry_id: jEntry.id,
                account_id: ivaAccount.id,
                debit: 0,
                credit: tax_total,
                description: `IVA Facturado`
              });
            }

            // Crédito a Ingresos por Domicilios
            if (parsedDeliveryFee > 0 && (deliveryIncomeAccount || ventasAccount)) {
              await trx('journal_entry_lines').insert({
                journal_entry_id: jEntry.id,
                account_id: (deliveryIncomeAccount || ventasAccount).id,
                debit: 0,
                credit: parsedDeliveryFee,
                description: `Ingreso por Servicio de Domicilio`
              });
            }
          }
        }
      } catch (accErr) {
        console.warn('Advertencia al generar asiento contable:', accErr.message);
      }

      return createdInvoiceId;
    });

    const targetInvoiceId = invoiceId || createdInvoiceRow?.id;

    // Obtener factura completa para retornar
    let invoice = null;
    if (targetInvoiceId) {
      invoice = await knex('invoices as i')
        .leftJoin('users as u_cashier', 'i.user_id', 'u_cashier.id')
        .leftJoin('orders as o', 'i.order_id', 'o.id')
        .leftJoin('users as u_waiter', 'o.user_id', 'u_waiter.id')
        .leftJoin('tables_restaurant as t', 'o.table_id', 't.id')
        .leftJoin('customers as c', 'i.customer_id', 'c.id')
        .leftJoin('accounts_receivable as ar', 'i.id', 'ar.invoice_id')
        .select(
          'i.*',
          'o.order_type as order_type',
          'o.delivery_address as delivery_address',
          'o.delivery_phone as delivery_phone',
          'o.delivery_notes as delivery_notes',
          'u_cashier.full_name as cashier_name',
          'u_waiter.full_name as waiter_name',
          't.table_number',
          'c.name as customer_name',
          'c.document_type as customer_doc_type',
          'c.document_number as customer_document',
          'c.phone as customer_phone',
          'c.address as customer_address',
          'c.city as customer_city',
          'c.email as customer_email',
          'ar.amount as credit_amount',
          'ar.paid_amount as credit_paid_amount',
          'ar.balance as credit_balance',
          'ar.due_date as credit_due_date',
          'ar.status as credit_status'
        )
        .where('i.id', targetInvoiceId)
        .first();
    }

    if (!invoice) {
      invoice = await knex('invoices as i')
        .where('i.id', targetInvoiceId)
        .first();
    }

    if (!invoice) {
      throw new Error('No se pudo confirmar el registro de la factura en la base de datos');
    }

    const invoiceItems = await knex('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .select('oi.*', 'p.name')
      .where('oi.order_id', order_id);

    let invoiceSettings = null;
    if (effectiveBranchId) {
      invoiceSettings = await knex('settings').where({ business_id: businessId, branch_id: effectiveBranchId }).first();
    }
    if (!invoiceSettings) {
      invoiceSettings = await knex('settings').where({ business_id: businessId }).whereNull('branch_id').first();
    }
    if (!invoiceSettings) {
      invoiceSettings = await knex('settings').where({ business_id: businessId }).first();
    }

    const fullInvoice = { ...invoice, items: invoiceItems, settings: invoiceSettings };

    if (req.app && req.app.locals && req.app.locals.io) {
      if (order.table_id) {
        if (effectiveBranchId) req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
        req.app.locals.io.to(`business:${businessId}`).emit('table:status-changed', { table_id: order.table_id, status: 'libre' });
      }
      if (effectiveBranchId) {
        req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('order:status-changed', { order_id: parsedOrderId, status: targetOrderStatus });
        req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('order:updated', { order_id: parsedOrderId, status: targetOrderStatus });
        req.app.locals.io.to(`branch:${effectiveBranchId}`).emit('invoice:created', fullInvoice);
      }
      req.app.locals.io.to(`business:${businessId}`).emit('order:status-changed', { order_id: parsedOrderId, status: targetOrderStatus });
      req.app.locals.io.to(`business:${businessId}`).emit('order:updated', { order_id: parsedOrderId, status: targetOrderStatus });
      req.app.locals.io.to(`business:${businessId}`).emit('invoice:created', fullInvoice);
    }

    res.status(201).json(fullInvoice);
  } catch (err) {
    console.error('Error al generar factura:', err);
    res.status(500).json({ error: err.message || 'Error al generar factura', details: err.message });
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

      // Si tenía CxC, eliminarla
      await trx('accounts_receivable')
        .where({ invoice_id: id })
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
