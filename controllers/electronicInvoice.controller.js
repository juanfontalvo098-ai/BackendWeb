/**
 * Electronic Invoice Controller — Multi-tenant
 * Preparación para facturación electrónica: secuencias, notas crédito/débito
 * NOTA: La integración con DIAN se implementará en fase futura
 */
const knex = require('../database/knex');

// ==================== SECUENCIAS ====================

exports.getSequences = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const sequences = await knex('invoice_sequences')
      .where('business_id', businessId)
      .orderBy('document_type');
    res.json(sequences);
  } catch (err) {
    console.error('Error al obtener secuencias:', err);
    res.status(500).json({ error: 'Error al obtener secuencias' });
  }
};

exports.createSequence = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const { document_type, prefix, resolution_number, resolution_date, range_start, range_end } = req.body;

    const [seq] = await knex('invoice_sequences').insert({
      business_id: businessId, branch_id: branchId || null,
      document_type, prefix,
      resolution_number: resolution_number || null,
      resolution_date: resolution_date || null,
      range_start: range_start || null,
      range_end: range_end || null
    }).returning('*');

    res.status(201).json(seq);
  } catch (err) {
    console.error('Error al crear secuencia:', err);
    res.status(500).json({ error: 'Error al crear secuencia' });
  }
};

exports.updateSequence = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const data = req.body;

    const updateData = {};
    ['prefix', 'resolution_number', 'resolution_date', 'range_start', 'range_end', 'is_active'].forEach(f => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });

    await knex('invoice_sequences').where({ id, business_id: businessId }).update(updateData);
    res.json({ message: 'Secuencia actualizada' });
  } catch (err) {
    console.error('Error al actualizar secuencia:', err);
    res.status(500).json({ error: 'Error al actualizar secuencia' });
  }
};

// ==================== NOTAS CRÉDITO ====================

exports.getCreditNotes = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('credit_notes as cn')
      .join('invoices as i', 'cn.invoice_id', 'i.id')
      .join('users as u', 'cn.user_id', 'u.id')
      .leftJoin('customers as c', 'cn.customer_id', 'c.id')
      .select('cn.*', 'i.invoice_number', 'u.full_name as user_name', 'c.name as customer_name')
      .where('cn.business_id', businessId);

    if (branchId && !isGlobalScope) query.andWhere('cn.branch_id', branchId);

    const notes = await query.orderBy('cn.created_at', 'desc');
    res.json(notes);
  } catch (err) {
    console.error('Error al obtener notas crédito:', err);
    res.status(500).json({ error: 'Error al obtener notas crédito' });
  }
};

exports.createCreditNote = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { invoice_id, reason, subtotal, tax_total, total } = req.body;

    if (!invoice_id || !reason) {
      return res.status(400).json({ error: 'Factura y razón son requeridas' });
    }

    const invoice = await knex('invoices').where({ id: invoice_id, business_id: businessId }).first();
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    // Generar número de nota crédito
    const count = await knex('credit_notes').where('business_id', businessId).count('id as c').first();
    const creditNoteNumber = `NC-${String(parseInt(count.c) + 1).padStart(6, '0')}`;

    const [cn] = await knex('credit_notes').insert({
      business_id: businessId, branch_id: branchId,
      invoice_id, customer_id: invoice.customer_id || null,
      credit_note_number: creditNoteNumber,
      reason,
      subtotal: subtotal || invoice.subtotal,
      tax_total: tax_total || invoice.tax_total,
      total: total || invoice.total,
      user_id: userId
    }).returning('*');

    res.status(201).json(cn);
  } catch (err) {
    console.error('Error al crear nota crédito:', err);
    res.status(500).json({ error: 'Error al crear nota crédito' });
  }
};

// ==================== NOTAS DÉBITO ====================

exports.getDebitNotes = async (req, res) => {
  try {
    const { businessId, branchId, isGlobalScope } = req.tenant;

    let query = knex('debit_notes as dn')
      .join('invoices as i', 'dn.invoice_id', 'i.id')
      .join('users as u', 'dn.user_id', 'u.id')
      .leftJoin('customers as c', 'dn.customer_id', 'c.id')
      .select('dn.*', 'i.invoice_number', 'u.full_name as user_name', 'c.name as customer_name')
      .where('dn.business_id', businessId);

    if (branchId && !isGlobalScope) query.andWhere('dn.branch_id', branchId);

    const notes = await query.orderBy('dn.created_at', 'desc');
    res.json(notes);
  } catch (err) {
    console.error('Error al obtener notas débito:', err);
    res.status(500).json({ error: 'Error al obtener notas débito' });
  }
};

exports.createDebitNote = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;
    const userId = req.user.id;
    const { invoice_id, reason, subtotal, tax_total, total } = req.body;

    if (!invoice_id || !reason) {
      return res.status(400).json({ error: 'Factura y razón son requeridas' });
    }

    const count = await knex('debit_notes').where('business_id', businessId).count('id as c').first();
    const debitNoteNumber = `ND-${String(parseInt(count.c) + 1).padStart(6, '0')}`;

    const [dn] = await knex('debit_notes').insert({
      business_id: businessId, branch_id: branchId,
      invoice_id, customer_id: null,
      debit_note_number: debitNoteNumber,
      reason,
      subtotal: parseFloat(subtotal),
      tax_total: parseFloat(tax_total),
      total: parseFloat(total),
      user_id: userId
    }).returning('*');

    res.status(201).json(dn);
  } catch (err) {
    console.error('Error al crear nota débito:', err);
    res.status(500).json({ error: 'Error al crear nota débito' });
  }
};
