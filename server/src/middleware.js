// middleware.js - JWT Authentication & Backend-Enforced Role-Based Access Control
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aicte-flowtrack-secure-prototype-key-2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = decoded;
    next();
  });
}

/**
 * Server-side permission check: ensures user has one of the allowed profile roles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Permission Denied. Required role in [${allowedRoles.join(', ')}], but your role is '${req.user ? req.user.role : 'Unauthenticated'}'.`
      });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticateToken,
  requireRole
};
