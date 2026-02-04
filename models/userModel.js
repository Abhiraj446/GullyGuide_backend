const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter your name"],
    minlength: [3, "Name must be at least 3 characters"],
  },

  email: {
    type: String,
    required: [true, "Please enter your email"],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Please enter a valid email"],
  },

  password: {
    type: String,
    required: [true, "Please enter a password"],
    minlength: [8, "Password must be at least 8 characters"],
    select: false,
  },

  phone: {
    type: String,
    required: [true, "Please enter your phone number"],
    validate: {
      validator: function(v) {
        return /^[0-9]{10}$/.test(v);
      },
      message: "Phone number must be 10 digits"
    }
  },

  role: {
    type: String,
    enum: ["tourist", "guide", "admin"],
    default: "tourist",
  },

  avatar: {
    type: String,
    default: "default_avatar.jpg"
  },

  languages: [{
    type: String
  }],

  location: {
    city: String,
    state: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  otp: String,
  otpExpire: Date,

  resetPasswordToken: String,
  resetPasswordExpire: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving

userSchema.pre("save", async function() {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) {
    return;
  }
  
  try {
    // Generate salt
    const salt = await bcrypt.genSalt(10);
    
    // Hash the password along with the new salt
    const hash = await bcrypt.hash(this.password, salt);
    
    // Override the cleartext password with the hashed one
    this.password = hash;
  } catch (error) {
    throw error;
  }
});

// JWT Token
userSchema.methods.getJWTToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "7d" }
  );
};

// Compare password
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate reset password token
userSchema.methods.getResetPasswordToken = function() {
  // Generate the actual token (unhashed - this is what we send to user)
  const resetToken = crypto.randomBytes(20).toString("hex");
  
  // Hash the token and save to database (for security)
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
    
  // Set token expiry (15 minutes from now)
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  
  // Return the unhashed token to send via email
  return resetToken;
};

module.exports = mongoose.model("User", userSchema);