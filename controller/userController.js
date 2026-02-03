const User = require("../models/userModel");
const jwt = require("jsonwebtoken");

// create JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "90d",
  });
};

// ================= REGISTER USER =================
exports.registerUser = async (req, res) => {
  console.log('Register endpoint hit; body:', req.body);
  try {
    const { name, email, password } = req.body;

    // Basic validation log
    if (!name || !email || !password) {
      console.warn('Register missing fields:', { name, email, password });
      return res.status(400).json({ status: 'fail', message: 'Please provide name, email and password' });
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    console.log('User created:', user._id);

    const token = signToken(user._id);

    res.status(201).json({
      status: "success",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Register error:', err);

    // Handle duplicate key (email already in use)
    if (err.code === 11000 && err.keyValue && err.keyValue.email) {
      return res.status(400).json({ status: 'fail', message: `Email already exists: ${err.keyValue.email}` });
    }

    // Delegate other errors to global handler if present
    if (typeof next === 'function') return next(err);

    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

// ================= LOGIN USER =================
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        message: "Incorrect email or password",
      });
    }

    const token = signToken(user._id);

    res.status(200).json({
      status: "success",
      token,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};
