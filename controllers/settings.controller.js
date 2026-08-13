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
      // Crear settings por defecto
      const [newSettings] = await knex('settings').insert({
        business_id: businessId,
        branch_id: null,
        business_name: 'GastrosPOS Enterprise',
        nit: '900.123.456-7',
        address: '',
        phone: '',
        receipt_footer: '¡Gracias por su compra! Vuelva pronto.',
        default_paper_width: '80mm'
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
      default_paper_width: default_paper_width || '80mm'
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
