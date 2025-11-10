// Middleware/auth.js
import jwt from "jsonwebtoken";


export const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid/expired token" });
  }
};

/**
 * roleCheck: returns middleware that ensures the user has one of the allowed roles.
 * Example: roleCheck(['owner','admin'])
 */
export const roleCheck = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden: insufficient permissions" });
  }
  next();
};

