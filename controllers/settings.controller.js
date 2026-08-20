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
        .whereNull('branch_id')
        .first();
    }

    if (!settings) {
      // Buscar información del negocio actual en la base de datos
      const biz = await knex('businesses').where({ id: businessId }).first();

      const [newSettings] = await knex('settings').insert({
        business_id: businessId,
        branch_id: null,
        business_name: biz ? biz.name : 'Mi Negocio POS',
        nit: biz?.nit || '',
        address: '',
        phone: '',
        receipt_footer: '¡Gracias por su compra! Vuelva pronto.',
        default_paper_width: '80mm',
        logo_url: biz?.logo_url || ''
      }).returning('*');
      settings = newSettings;
    }

    res.json(settings);
  } catch (err) {
    console.error('Error al obtener configuración:', err);
    res.status(500).json({ error: 'Error al obtener la configuración del negocio' });
  }
};

exports.updateSettings = async (req, res) => {
  const { business_name, nit, address, phone, receipt_footer, logo_url, default_paper_width } = req.body;
  const { businessId, branchId } = req.tenant;

  try {
    // Determinar si actualizar config global o de sucursal
    const targetBranchId = req.body.branch_specific ? branchId : null;

    const existing = await knex('settings')
      .where({ business_id: businessId })
      .andWhere(function() {
        if (targetBranchId) {
          this.where('branch_id', targetBranchId);
        } else {
          this.whereNull('branch_id');
        }
      })
      .first();

    const settingsData = {
      business_name: business_name || 'GastrosPOS Enterprise',
      nit: nit || '',
      address: address || '',
      phone: phone || '',
      receipt_footer: receipt_footer || '¡Gracias por su compra!',
      logo_url: logo_url || '',
      default_paper_width: default_paper_width || '80mm',
      tax_regime: req.body.tax_regime || 'impoconsumo',
      print_tax_regime: req.body.print_tax_regime !== undefined ? (req.body.print_tax_regime === true || req.body.print_tax_regime === 1 || req.body.print_tax_regime === 'true') : true,
      custom_tax_regime_text: req.body.custom_tax_regime_text || '',
      economic_activity_code: req.body.economic_activity_code || '',
      invoice_prefix: req.body.invoice_prefix ? req.body.invoice_prefix.trim().toUpperCase() : 'FAC',
      enable_silent_printing: req.body.enable_silent_printing !== undefined ? !!req.body.enable_silent_printing : false,
      auto_print_kitchen_tickets: req.body.auto_print_kitchen_tickets !== undefined ? !!req.body.auto_print_kitchen_tickets : true,
      auto_print_invoices: req.body.auto_print_invoices !== undefined ? !!req.body.auto_print_invoices : false,
      silent_print_bridge_url: req.body.silent_print_bridge_url || 'http://localhost:8088',
      printer_kitchen_name: req.body.printer_kitchen_name || '',
      printer_receipt_name: req.body.printer_receipt_name || ''
    };

    if (existing) {
      await knex('settings').where('id', existing.id).update(settingsData);
    } else {
      await knex('settings').insert({
        business_id: businessId,
        branch_id: targetBranchId,
        ...settingsData
      });
    }

    res.json({ message: 'Configuración del negocio actualizada exitosamente' });
  } catch (err) {
    console.error('Error al guardar configuración:', err);
    res.status(500).json({ error: 'Error al guardar la configuración del negocio' });
  }
};
