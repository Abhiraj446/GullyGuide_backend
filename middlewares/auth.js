const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

exports.isAuthenticated = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in Authorization header
    if (req.headers.authorization && 
        req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    
    // Check for token in cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "Please login to access this resource" 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({ 
        success: false,
        message: "Please verify your account first" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token" 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: "Token has expired" 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Authentication failed" 
    });
  }
};

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: `Role (${req.user.role}) is not allowed to access this resource` 
      });
    }
    
    next();
  };
};