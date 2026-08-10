function errorHandler(err, req, res, next) {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor. Por favor intente más tarde.' });
}

module.exports = errorHandler;
