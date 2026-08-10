const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.post('/', auth, (req, res) => {
  try {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
      return res.status(400).json({ error: 'Filename y contenido base64 son requeridos' });
    }

    // Extraer tipo base64 (ej: data:image/png;base64,...)
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    if (matches && matches.length === 3) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64, 'base64');
    }

    const cleanFilename = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadsDir, cleanFilename);

    fs.writeFileSync(filePath, buffer);

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${cleanFilename}`;
    res.json({ url: fileUrl, filename: cleanFilename });
  } catch (err) {
    console.error('Error al subir archivo:', err);
    res.status(500).json({ error: 'Error interno al guardar la imagen en el servidor' });
  }
});

module.exports = router;
