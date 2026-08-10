const db = require('../database/connection');

exports.getSettings = (req, res) => {
  try {
    let settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!settings) {
      db.prepare("INSERT INTO settings (id, business_name, nit, address, phone, receipt_footer) VALUES (1, 'GastrosPOS Enterprise', '900.123.456-7', 'Calle 10 # 43-12, Medellín', '(604) 444-5566', '¡Gracias por su compra! Vuelva pronto.')").run();
      settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la configuración del negocio' });
  }
};

exports.updateSettings = (req, res) => {
  const { business_name, nit, address, phone, receipt_footer, logo_url, default_paper_width } = req.body;

  try {
    db.prepare(`
      UPDATE settings SET 
        business_name = ?, 
        nit = ?, 
        address = ?, 
        phone = ?, 
        receipt_footer = ?, 
        logo_url = ?, 
        default_paper_width = ?
      WHERE id = 1
    `).run(
      business_name || 'GastrosPOS Enterprise',
      nit || '900.123.456-7',
      address || '',
      phone || '',
      receipt_footer || '¡Gracias por su compra!',
      logo_url || '',
      default_paper_width || '80mm'
    );

    res.json({ message: 'Configuración del negocio actualizada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar la configuración del negocio' });
  }
};
