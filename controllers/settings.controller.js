/**
 * Settings Controller — Multi-tenant
 * Config por negocio con posibilidad de override por sucursal
 */
const knex = require('../database/knex');

exports.getSettings = async (req, res) => {
  try {
    const { businessId, branchId } = req.tenant;

    // Buscar config específica de sucursal primero, luego la global del negocio
    let settings = null;
    if (branchId) {
      settings = await knex('settings')
        .where({ business_id: businessId, branch_id: branchId })
        .first();
    }

    if (!settings) {
      settings = await knex('settings')
        .where({ business_id: businessId })
        .first();
    }

    if (!settings) {
      // Buscar información del negocio actual en la base de datos
      const biz = await knex('businesses').where({ id: businessId }).first();

      const [newSettings] = await knex('settings').insert({
        business_id: businessId,
        branch_id: branchId || null,
        business_name: biz ? biz.name : 'Mi Negocio POS',
        nit: biz?.nit || '',
        address: '',
        phone: '',
        receipt_footer: '¡Gracias por su preferencia!',
        default_paper_width: '80mm',
        logo_url: biz?.logo_url || '',
        enable_silent_printing: false,
        auto_print_kitchen_tickets: true,
        auto_print_invoices: false,
        open_drawer_on_payment: true,
        silent_print_bridge_url: 'http://localhost:8182',
        printer_kitchen_name: '',
        printer_receipt_name: '',
        printer_bar_name: ''
      }).returning('*');
      settings = newSettings;
    }

    // Normalizar campos para compatibilidad
    settings.paper_width = settings.default_paper_width || '80mm';

    res.json(settings);
  } catch (err) {
    console.error('Error al obtener configuración:', err);
    res.status(500).json({ error: 'Error al obtener la configuración del negocio' });
  }
};

exports.updateSettings = async (req, res) => {
  const { businessId, branchId } = req.tenant;

  try {
    const isBool = (val, defaultVal = false) => {
      if (val === undefined || val === null) return defaultVal;
      return val === true || val === 1 || val === 'true' || val === '1';
    };

    const targetBranchId = req.body.branch_specific ? branchId : null;

    const settingsData = {
      business_name: req.body.business_name || 'GastrosPOS Enterprise',
      nit: req.body.nit || '',
      address: req.body.address || '',
      phone: req.body.phone || '',
      receipt_footer: req.body.receipt_footer || '¡Gracias por su compra!',
      logo_url: req.body.logo_url || '',
      default_paper_width: req.body.default_paper_width || req.body.paper_width || '80mm',
      tax_regime: req.body.tax_regime || 'impoconsumo',
      print_tax_regime: isBool(req.body.print_tax_regime, true),
      custom_tax_regime_text: req.body.custom_tax_regime_text || '',
      economic_activity_code: req.body.economic_activity_code || '',
      invoice_prefix: req.body.invoice_prefix ? req.body.invoice_prefix.trim().toUpperCase() : 'FAC',
      enable_silent_printing: isBool(req.body.enable_silent_printing, false),
      auto_print_kitchen_tickets: isBool(req.body.auto_print_kitchen_tickets, true),
      auto_print_invoices: isBool(req.body.auto_print_invoices, false),
      open_drawer_on_payment: isBool(req.body.open_drawer_on_payment, true),
      silent_print_bridge_url: req.body.silent_print_bridge_url ? req.body.silent_print_bridge_url.trim() : 'http://localhost:8182',
      printer_kitchen_name: req.body.printer_kitchen_name ? req.body.printer_kitchen_name.trim() : '',
      printer_receipt_name: req.body.printer_receipt_name ? req.body.printer_receipt_name.trim() : '',
      printer_bar_name: req.body.printer_bar_name ? req.body.printer_bar_name.trim() : ''
    };

    // Actualizar todas las filas de este negocio o insertar si no existe
    const existing = await knex('settings').where({ business_id: businessId }).first();

    if (existing) {
      await knex('settings')
        .where({ business_id: businessId })
        .update(settingsData);
    } else {
      await knex('settings').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        ...settingsData
      });
    }

    // Retornar la configuración recién actualizada
    const updated = await knex('settings').where({ business_id: businessId }).first();
    if (updated) {
      updated.paper_width = updated.default_paper_width || '80mm';
    }

    res.json({ message: 'Configuración guardada exitosamente', settings: updated });
  } catch (err) {
    console.error('Error al guardar configuración:', err);
    res.status(500).json({ error: 'Error al guardar la configuración del negocio: ' + err.message });
  }
};
