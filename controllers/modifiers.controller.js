/**
 * Modifiers Controller — Multi-tenant
 * Gestión de grupos de modificadores, sabores y toppings por producto con enlace a insumos
 * Soporta biblioteca de plantillas reutilizables para aplicar a cualquier producto en 1 clic
 */
const knex = require('../database/knex');

// Obtener modificadores configurados para un producto específico
exports.getByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const { businessId } = req.tenant;

    const groups = await knex('product_modifier_groups as pmg')
      .where({ 'pmg.product_id': productId, 'pmg.business_id': businessId })
      .orderBy('pmg.display_order', 'asc')
      .orderBy('pmg.id', 'asc');

    for (const group of groups) {
      group.options = await knex('product_modifier_options as pmo')
        .leftJoin('supplies as s', 'pmo.supply_id', 's.id')
        .select(
          'pmo.*',
          's.name as supply_name',
          's.unit_of_measure as supply_unit',
          's.cost_price as supply_cost'
        )
        .where('pmo.group_id', group.id)
        .orderBy('pmo.display_order', 'asc')
        .orderBy('pmo.id', 'asc');
    }

    res.json(groups);
  } catch (err) {
    console.error('Error al obtener modificadores del producto:', err);
    res.status(500).json({ error: 'Error al obtener modificadores' });
  }
};

// Obtener biblioteca de plantillas reutilizables guardadas
exports.getTemplates = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const groups = await knex('product_modifier_groups as pmg')
      .where({ 'pmg.business_id': businessId, 'pmg.is_template': true })
      .orderBy('pmg.name', 'asc');

    for (const group of groups) {
      group.options = await knex('product_modifier_options as pmo')
        .leftJoin('supplies as s', 'pmo.supply_id', 's.id')
        .select(
          'pmo.*',
          's.name as supply_name',
          's.unit_of_measure as supply_unit',
          's.cost_price as supply_cost'
        )
        .where('pmo.group_id', group.id)
        .orderBy('pmo.display_order', 'asc')
        .orderBy('pmo.id', 'asc');
    }

    res.json(groups);
  } catch (err) {
    console.error('Error al obtener plantillas de modificadores:', err);
    res.status(500).json({ error: 'Error al obtener plantillas' });
  }
};

// Guardar un grupo como plantilla reutilizable
exports.saveAsTemplate = async (req, res) => {
  const { group } = req.body;
  const { businessId } = req.tenant;

  if (!group || !group.name || !group.name.trim()) {
    return res.status(400).json({ error: 'El nombre de la plantilla es obligatorio' });
  }

  try {
    await knex.transaction(async (trx) => {
      const [newGroup] = await trx('product_modifier_groups').insert({
        business_id: businessId,
        product_id: null,
        name: group.name.trim(),
        min_selectable: parseInt(group.min_selectable, 10) || 0,
        max_selectable: parseInt(group.max_selectable, 10) || 1,
        is_required: Boolean(group.is_required),
        is_multiple: Boolean(group.is_multiple),
        is_template: true,
        display_order: 0
      }).returning('*');

      if (Array.isArray(group.options) && group.options.length > 0) {
        const optionsToInsert = group.options.map((opt, idx) => ({
          group_id: newGroup.id,
          name: opt.name.trim(),
          price_modifier: parseFloat(opt.price_modifier) || 0,
          supply_id: opt.supply_id ? parseInt(opt.supply_id, 10) : null,
          supply_quantity: opt.supply_quantity ? parseFloat(opt.supply_quantity) : 0,
          unit_of_measure: opt.unit_of_measure || 'unidad',
          is_available: opt.is_available !== undefined ? Boolean(opt.is_available) : true,
          display_order: idx
        }));
        await trx('product_modifier_options').insert(optionsToInsert);
      }
    });

    res.status(201).json({ message: 'Plantilla guardada exitosamente' });
  } catch (err) {
    console.error('Error al guardar plantilla:', err);
    res.status(500).json({ error: 'Error al guardar plantilla' });
  }
};

// Eliminar una plantilla
exports.deleteTemplate = async (req, res) => {
  const { templateId } = req.params;
  const { businessId } = req.tenant;

  try {
    const deleted = await knex('product_modifier_groups')
      .where({ id: templateId, business_id: businessId, is_template: true })
      .del();

    if (deleted === 0) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    res.json({ message: 'Plantilla eliminada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar plantilla:', err);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
};

// Guardar o actualizar la estructura completa de modificadores de un producto
exports.saveProductModifiers = async (req, res) => {
  const { productId } = req.params;
  const { groups } = req.body; // Array de grupos con sus opciones
  const { businessId } = req.tenant;

  try {
    const product = await knex('products')
      .where({ id: productId, business_id: businessId })
      .first();

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    await knex.transaction(async (trx) => {
      // 1. Obtener grupos existentes
      const existingGroups = await trx('product_modifier_groups')
        .where({ product_id: productId, business_id: businessId });
      const incomingGroupIds = (groups || []).filter(g => g.id).map(g => g.id);

      // Eliminar grupos que ya no están en la petición
      for (const exGroup of existingGroups) {
        if (!incomingGroupIds.includes(exGroup.id)) {
          await trx('product_modifier_groups').where('id', exGroup.id).del();
        }
      }

      // 2. Procesar cada grupo recibido
      if (Array.isArray(groups)) {
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          const g = groups[gIdx];
          let groupId = g.id;

          const groupData = {
            business_id: businessId,
            product_id: parseInt(productId, 10),
            name: g.name.trim(),
            min_selectable: parseInt(g.min_selectable, 10) || 0,
            max_selectable: parseInt(g.max_selectable, 10) || 1,
            is_required: Boolean(g.is_required),
            is_multiple: Boolean(g.is_multiple),
            is_template: false,
            display_order: g.display_order !== undefined ? parseInt(g.display_order, 10) : gIdx
          };

          if (groupId && existingGroups.some(eg => eg.id === groupId)) {
            await trx('product_modifier_groups').where('id', groupId).update(groupData);
          } else {
            const [newGroup] = await trx('product_modifier_groups').insert(groupData).returning('*');
            groupId = newGroup.id;
          }

          // Procesar opciones del grupo
          const existingOptions = await trx('product_modifier_options').where('group_id', groupId);
          const incomingOptionIds = (g.options || []).filter(o => o.id).map(o => o.id);

          // Eliminar opciones removidas
          for (const exOpt of existingOptions) {
            if (!incomingOptionIds.includes(exOpt.id)) {
              await trx('product_modifier_options').where('id', exOpt.id).del();
            }
          }

          // Insertar / Actualizar opciones
          if (Array.isArray(g.options)) {
            for (let oIdx = 0; oIdx < g.options.length; oIdx++) {
              const opt = g.options[oIdx];
              const optData = {
                group_id: groupId,
                name: opt.name.trim(),
                price_modifier: parseFloat(opt.price_modifier) || 0,
                supply_id: opt.supply_id ? parseInt(opt.supply_id, 10) : null,
                supply_quantity: opt.supply_quantity ? parseFloat(opt.supply_quantity) : 0,
                unit_of_measure: opt.unit_of_measure || 'unidad',
                is_available: opt.is_available !== undefined ? Boolean(opt.is_available) : true,
                display_order: opt.display_order !== undefined ? parseInt(opt.display_order, 10) : oIdx
              };

              if (opt.id && existingOptions.some(eo => eo.id === opt.id)) {
                await trx('product_modifier_options').where('id', opt.id).update(optData);
              } else {
                await trx('product_modifier_options').insert(optData);
              }
            }
          }
        }
      }
    });

    res.json({ message: 'Modificadores del producto guardados exitosamente' });
  } catch (err) {
    console.error('Error al guardar modificadores:', err);
    res.status(500).json({ error: 'Error al guardar modificadores del producto' });
  }
};

// Cambiar disponibilidad rápida de una opción (ej. Sabor agotado)
exports.toggleOptionAvailability = async (req, res) => {
  const { optionId } = req.params;
  const { is_available } = req.body;
  const { businessId } = req.tenant;

  try {
    const option = await knex('product_modifier_options as pmo')
      .join('product_modifier_groups as pmg', 'pmo.group_id', 'pmg.id')
      .select('pmo.*', 'pmg.business_id')
      .where({ 'pmo.id': optionId, 'pmg.business_id': businessId })
      .first();

    if (!option) {
      return res.status(404).json({ error: 'Opción no encontrada' });
    }

    const newStatus = is_available !== undefined ? Boolean(is_available) : !option.is_available;
    await knex('product_modifier_options')
      .where('id', optionId)
      .update({ is_available: newStatus });

    res.json({ message: `Opción ${newStatus ? 'disponible' : 'marcada como agotada'}`, is_available: newStatus });
  } catch (err) {
    console.error('Error al cambiar disponibilidad de opción:', err);
    res.status(500).json({ error: 'Error al actualizar disponibilidad' });
  }
};
