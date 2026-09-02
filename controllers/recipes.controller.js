/**
 * Recipes Controller — Multi-tenant
 * Fichas Técnicas / Recetas (Bill of Materials - BOM)
 * Vincula un Producto Terminado con sus Insumos / Materias Primas correspondientes
 */
const knex = require('../database/knex');

exports.getAll = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const recipes = await knex('recipes as r')
      .join('products as p', 'r.product_id', 'p.id')
      .select('r.*', 'p.name as product_name', 'p.price', 'p.cost_price as product_cost')
      .where('r.business_id', businessId)
      .orderBy('p.name');

    // Cargar insumos/ingredientes de cada receta
    for (const recipe of recipes) {
      recipe.ingredients = await knex('recipe_items as ri')
        .leftJoin('supplies as s', 'ri.supply_id', 's.id')
        .leftJoin('products as p', 'ri.ingredient_id', 'p.id')
        .select(
          'ri.*',
          knex.raw('COALESCE(s.name, p.name, \'Insumo sin nombre\') as supply_name'),
          knex.raw('COALESCE(s.name, p.name, \'Insumo sin nombre\') as ingredient_name'),
          knex.raw('COALESCE(s.cost_price, p.cost_price, 0) as unit_cost'),
          knex.raw('COALESCE(s.cost_price, p.cost_price, 0) as ingredient_cost'),
          knex.raw('COALESCE(ri.unit_of_measure, s.unit_of_measure, \'unidad\') as unit_of_measure'),
          's.category as supply_category'
        )
        .where('ri.recipe_id', recipe.id);

      // Cargar grupos de modificadores / sabores vinculados a este producto
      const modifierGroups = await knex('product_modifier_groups as pmg')
        .where({ 'pmg.product_id': recipe.product_id, 'pmg.business_id': businessId })
        .orderBy('pmg.display_order', 'asc');

      for (const group of modifierGroups) {
        group.options = await knex('product_modifier_options as pmo')
          .leftJoin('supplies as s', 'pmo.supply_id', 's.id')
          .select(
            'pmo.*',
            's.name as supply_name',
            's.unit_of_measure as supply_unit',
            's.cost_price as supply_cost'
          )
          .where('pmo.group_id', group.id)
          .orderBy('pmo.display_order', 'asc');

        for (const opt of group.options) {
          opt.supply_quantity = parseFloat(parseFloat(opt.supply_quantity || 0).toFixed(1));
          opt.price_modifier = parseFloat(parseFloat(opt.price_modifier || 0).toFixed(0));
        }
      }

      recipe.modifier_groups = modifierGroups;

      // Calcular costo total de la receta sumando el costo de cada insumo base
      recipe.total_cost = recipe.ingredients.reduce((sum, ing) => {
        const qty = parseFloat(ing.quantity || 0);
        const cost = parseFloat(ing.unit_cost || 0);
        return sum + (qty * cost);
      }, 0);

      // Margen de ganancia base
      const price = parseFloat(recipe.price || 0);
      recipe.profit_margin = price > 0 ? ((price - recipe.total_cost) / price) * 100 : 0;
    }

    res.json(recipes);
  } catch (err) {
    console.error('Error al obtener recetas:', err);
    res.status(500).json({ error: 'Error al obtener recetas' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { businessId } = req.tenant;

    const recipe = await knex('recipes as r')
      .join('products as p', 'r.product_id', 'p.id')
      .select('r.*', 'p.name as product_name', 'p.price', 'p.cost_price as product_cost')
      .where({ 'r.id': req.params.id, 'r.business_id': businessId })
      .first();

    if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });

    recipe.ingredients = await knex('recipe_items as ri')
      .leftJoin('supplies as s', 'ri.supply_id', 's.id')
      .leftJoin('products as p', 'ri.ingredient_id', 'p.id')
      .select(
        'ri.*',
        knex.raw('COALESCE(s.name, p.name, \'Insumo sin nombre\') as supply_name'),
        knex.raw('COALESCE(s.name, p.name, \'Insumo sin nombre\') as ingredient_name'),
        knex.raw('COALESCE(s.cost_price, p.cost_price, 0) as unit_cost'),
        knex.raw('COALESCE(s.cost_price, p.cost_price, 0) as ingredient_cost'),
        knex.raw('COALESCE(ri.unit_of_measure, s.unit_of_measure, \'unidad\') as unit_of_measure'),
        's.category as supply_category'
      )
      .where('ri.recipe_id', recipe.id);

    const modifierGroups = await knex('product_modifier_groups as pmg')
      .where({ 'pmg.product_id': recipe.product_id, 'pmg.business_id': businessId })
      .orderBy('pmg.display_order', 'asc');

    for (const group of modifierGroups) {
      group.options = await knex('product_modifier_options as pmo')
        .leftJoin('supplies as s', 'pmo.supply_id', 's.id')
        .select(
          'pmo.*',
          's.name as supply_name',
          's.unit_of_measure as supply_unit',
          's.cost_price as supply_cost'
        )
        .where('pmo.group_id', group.id)
        .orderBy('pmo.display_order', 'asc');

      for (const opt of group.options) {
        opt.supply_quantity = parseFloat(parseFloat(opt.supply_quantity || 0).toFixed(1));
        opt.price_modifier = parseFloat(parseFloat(opt.price_modifier || 0).toFixed(0));
      }
    }

    recipe.modifier_groups = modifierGroups;

    recipe.total_cost = recipe.ingredients.reduce((sum, ing) => {
      const qty = parseFloat(ing.quantity || 0);
      const cost = parseFloat(ing.unit_cost || 0);
      return sum + (qty * cost);
    }, 0);

    const price = parseFloat(recipe.price || 0);
    recipe.profit_margin = price > 0 ? ((price - recipe.total_cost) / price) * 100 : 0;

    res.json(recipe);
  } catch (err) {
    console.error('Error al obtener receta:', err);
    res.status(500).json({ error: 'Error al obtener receta' });
  }
};

exports.create = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { product_id, yield_quantity, notes, ingredients } = req.body;

    if (!product_id || !ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: 'Producto e insumos son requeridos para la receta' });
    }

    const recipeId = await knex.transaction(async (trx) => {
      const [recipe] = await trx('recipes').insert({
        business_id: businessId,
        product_id,
        yield_quantity: parseFloat(yield_quantity) || 1,
        notes: notes || null
      }).returning('*');

      for (const ing of ingredients) {
        const supplyId = ing.supply_id ? parseInt(ing.supply_id, 10) : (ing.ingredient_id ? parseInt(ing.ingredient_id, 10) : null);
        
        let unitCost = 0;
        if (supplyId) {
          const sup = await trx('supplies').where('id', supplyId).first();
          unitCost = sup ? parseFloat(sup.cost_price || 0) : 0;
        }

        await trx('recipe_items').insert({
          recipe_id: recipe.id,
          supply_id: supplyId,
          ingredient_id: null,
          quantity: parseFloat(ing.quantity) || 0,
          unit_of_measure: ing.unit_of_measure || 'unidad',
          cost: (parseFloat(ing.quantity) || 0) * unitCost
        });
      }

      return recipe.id;
    });

    res.status(201).json({ id: recipeId, message: 'Ficha técnica / Receta creada exitosamente' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Este producto ya tiene una receta asignada' });
    }
    console.error('Error al crear receta:', err);
    res.status(500).json({ error: 'Error al crear receta: ' + err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    const { id } = req.params;
    const { yield_quantity, notes, ingredients } = req.body;

    const recipe = await knex('recipes').where({ id, business_id: businessId }).first();
    if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });

    await knex.transaction(async (trx) => {
      await trx('recipes').where({ id }).update({
        yield_quantity: parseFloat(yield_quantity) || recipe.yield_quantity,
        notes: notes !== undefined ? notes : recipe.notes
      });

      if (ingredients && ingredients.length > 0) {
        await trx('recipe_items').where('recipe_id', id).del();
        for (const ing of ingredients) {
          const supplyId = ing.supply_id ? parseInt(ing.supply_id, 10) : (ing.ingredient_id ? parseInt(ing.ingredient_id, 10) : null);

          let unitCost = 0;
          if (supplyId) {
            const sup = await trx('supplies').where('id', supplyId).first();
            unitCost = sup ? parseFloat(sup.cost_price || 0) : 0;
          }

          await trx('recipe_items').insert({
            recipe_id: id,
            supply_id: supplyId,
            ingredient_id: null,
            quantity: parseFloat(ing.quantity) || 0,
            unit_of_measure: ing.unit_of_measure || 'unidad',
            cost: (parseFloat(ing.quantity) || 0) * unitCost
          });
        }
      }
    });

    res.json({ message: 'Ficha técnica / Receta actualizada exitosamente' });
  } catch (err) {
    console.error('Error al actualizar receta:', err);
    res.status(500).json({ error: 'Error al actualizar receta: ' + err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const { businessId } = req.tenant;
    await knex('recipes').where({ id: req.params.id, business_id: businessId }).del();
    res.json({ message: 'Ficha técnica / Receta eliminada exitosamente' });
  } catch (err) {
    console.error('Error al eliminar receta:', err);
    res.status(500).json({ error: 'Error al eliminar receta' });
  }
};
