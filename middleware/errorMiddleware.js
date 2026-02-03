// Global error handling middleware
module.exports = (err, req, res, next) => {
  console.error('Global error handler:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ status: 'fail', message: messages.join('. ') });
  }

  // Duplicate key (e.g., unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    return res.status(400).json({ status: 'fail', message: `${field} already exists${value ? `: ${value}` : ''}` });
  }

  // Fallback
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    message: err.message || 'Internal Server Error',
  });
};