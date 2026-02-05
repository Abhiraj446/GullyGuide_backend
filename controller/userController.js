const User = require("../models/userModel");
const crypto = require("crypto"); // Uncomment this line
const sendEmail = require("../utils/sendEmail");
const bcrypt = require("bcrypt"); // Add this import

// Temporary storage for unverified users (in production, use Redis)
const tempUsers = new Map();

/* ======================================================
   REGISTER USER + SEND OTP
====================================================== */
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Validation
    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // If unverified user exists, update OTP
    if (existingUser && !existingUser.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      existingUser.otp = otp;
      existingUser.otpExpire = Date.now() + 10 * 60 * 1000;
      await existingUser.save({ validateBeforeSave: false });

      try {
        await sendEmail({
          email: existingUser.email,
          subject: "LocalTourX Account Verification",
          message: `Your OTP is ${otp}. It is valid for 10 minutes.`,
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent to your email",
          email: existingUser.email,
        });
      } catch (emailError) {
        return res.status(500).json({
          success: false,
          message: "Failed to send OTP email",
        });
      }
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store temporary user data with PLAIN password
    // Mongoose middleware will hash it when we create the user
    const tempUser = {
      name,
      email,
      password: password, // Store plain password
      phone,
      role: role || "tourist",
      otp,
      otpExpire: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now()
    };

    // Store in temporary storage (in production use Redis)
    tempUsers.set(email, tempUser);

    // Set expiration for temp data (15 minutes)
    setTimeout(() => {
      tempUsers.delete(email);
    }, 15 * 60 * 1000);

    try {
      // Send OTP email
      await sendEmail({
        email: email,
        subject: "LocalTourX Account Verification",
        message: `Your OTP is ${otp}. It is valid for 10 minutes.`,
      });

      res.status(200).json({
        success: true,
        message: "OTP sent to your email",
        email: email,
      });
    } catch (emailError) {
      tempUsers.delete(email); // Clean up on email failure
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email",
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   VERIFY OTP & CREATE USER
====================================================== */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and OTP are required" 
      });
    }

    // Check if user already exists and is verified
    const existingVerifiedUser = await User.findOne({ email, isVerified: true });
    if (existingVerifiedUser) {
      return res.status(400).json({
        success: false,
        message: "User already verified. Please login.",
      });
    }

    // Check for existing unverified user in DB
    let existingUser = await User.findOne({ email, isVerified: false });
    
    if (existingUser) {
      // Verify OTP from database
      if (!existingUser.otp || !existingUser.otpExpire) {
        return res.status(400).json({
          success: false,
          message: "OTP expired. Please register again.",
        });
      }

      if (existingUser.otp !== otp || existingUser.otpExpire < Date.now()) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP",
        });
      }

      // Mark as verified
      existingUser.isVerified = true;
      existingUser.otp = undefined;
      existingUser.otpExpire = undefined;
      await existingUser.save();

      // Generate token
      const token = existingUser.getJWTToken();

      return res.status(200).json({
        success: true,
        message: "Account verified successfully",
        token,
        user: {
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          isVerified: existingUser.isVerified,
        },
      });
    }

    // Check temporary storage for new registration
    const tempUser = tempUsers.get(email);
    if (!tempUser) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired. Please register again.",
      });
    }

    // Verify OTP
    if (tempUser.otp !== otp || tempUser.otpExpire < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Create the user in database (Mongoose will hash the password)
    const user = await User.create({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password, // Mongoose middleware will hash this
      phone: tempUser.phone,
      role: tempUser.role,
      isVerified: true,
      otp: undefined,
      otpExpire: undefined,
    });

    // Clean up temporary storage
    tempUsers.delete(email);

    // Generate token
    const token = user.getJWTToken();

    res.status(201).json({
      success: true,
      message: "Account verified and created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   LOGIN USER
====================================================== */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      // Send new OTP if not verified
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.otp = otp;
      user.otpExpire = Date.now() + 10 * 60 * 1000;
      await user.save({ validateBeforeSave: false });

      try {
        await sendEmail({
          email: user.email,
          subject: "LocalTourX Account Verification",
          message: `Your OTP is ${otp}. It is valid for 10 minutes.`,
        });

        return res.status(401).json({
          success: false,
          message: "Account not verified. New OTP sent to your email.",
          requiresVerification: true,
          email: user.email,
        });
      } catch (emailError) {
        return res.status(500).json({
          success: false,
          message: "Failed to send verification email",
        });
      }
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate token
    const token = user.getJWTToken();

    // Remove password from response
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   LOGOUT USER
====================================================== */
exports.logoutUser = async (req, res) => {
  try {
    // Clear token cookie if using cookies
    res.cookie("token", null, {
      expires: new Date(Date.now()),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   FORGOT PASSWORD
====================================================== */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    // For security, don't reveal if user exists or not
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If your email is registered, you will receive a reset link",
      });
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetPasswordUrl = `${req.protocol}://${req.get("host")}/api/v1/password/reset/${resetToken}`;

    const message = `Your password reset link:\n\n${resetPasswordUrl}\n\nThis link is valid for 15 minutes.\n\nIf you did not request this, please ignore this email.`;

    try {
      await sendEmail({
        email: user.email,
        subject: "LocalTourX Password Recovery",
        message,
      });

      res.status(200).json({
        success: true,
        message: `Password reset email sent to ${user.email}`,
      });
    } catch (emailError) {
      // Reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      res.status(500).json({
        success: false,
        message: "Email could not be sent",
        error: emailError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   RESET PASSWORD
====================================================== */

exports.resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const { token } = req.params;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Hash the incoming token to compare with database
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    console.log("Token from URL:", token);
    console.log("Hashed token:", resetPasswordToken);
    console.log("Current time:", Date.now());

    // Find user with valid token and not expired
    const user = await User.findOne({
      resetPasswordToken: resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() } // $gt means greater than
    });

    console.log("User found:", user ? "Yes" : "No");
    if (user) {
      console.log("Token expiry:", user.resetPasswordExpire);
      console.log("Time left:", user.resetPasswordExpire - Date.now(), "ms");
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset token is invalid or has expired",
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Generate new token for automatic login
    const newToken = user.getJWTToken();

    res.status(200).json({
      success: true,
      message: "Password reset successful",
      token: newToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   UPDATE PASSWORD (Logged in user)
====================================================== */
exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from old password",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    // Check old password
    const isPasswordMatch = await user.comparePassword(oldPassword);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect",
      });
    }

    // Update password (Mongoose middleware will hash it)
    user.password = newPassword;
    await user.save();

    // Generate new token
    const token = user.getJWTToken();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   GET USER DETAILS
====================================================== */
exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   UPDATE PROFILE
====================================================== */
exports.updateProfile = async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      phone: req.body.phone,
      avatar: req.body.avatar,
      languages: req.body.languages,
      location: req.body.location,
    };

    // Remove undefined fields
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    // Don't allow email updates through this route
    if (updates.email) {
      delete updates.email;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

/* ======================================================
   RESEND OTP
====================================================== */

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // FIRST: Check if user exists and is verified in DATABASE
    const existingVerifiedUser = await User.findOne({ 
      email, 
      isVerified: true 
    });
    
    if (existingVerifiedUser) {
      return res.status(400).json({
        success: false,
        message: "User is already verified. Please login.",
      });
    }

    // SECOND: Check for unverified user in DATABASE
    let user = await User.findOne({ 
      email, 
      isVerified: false 
    });

    // THIRD: If not in database, check TEMPORARY STORAGE
    let tempUserData = null;
    if (!user) {
      tempUserData = tempUsers.get(email);
      if (!tempUserData) {
        return res.status(404).json({
          success: false,
          message: "Registration session expired. Please register again.",
        });
      }
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    if (user) {
      // Case: User exists in DB but not verified
      user.otp = otp;
      user.otpExpire = otpExpire;
      await user.save({ validateBeforeSave: false });
    } else {
      // Case: User is in temp storage (new registration)
      // Update temp storage with new OTP
      tempUserData.otp = otp;
      tempUserData.otpExpire = otpExpire;
      tempUsers.set(email, tempUserData);
      
      // Reset the auto-delete timer
      clearTimeout(tempUserData.timeoutId);
      const timeoutId = setTimeout(() => {
        tempUsers.delete(email);
      }, 15 * 60 * 1000);
      tempUserData.timeoutId = timeoutId;
    }

    try {
      // Send email
      await sendEmail({
        email: email,
        subject: "LocalTourX Account Verification",
        message: `Your new OTP is ${otp}. It is valid for 10 minutes.`,
      });

      res.status(200).json({
        success: true,
        message: "New OTP sent to your email",
      });
    } catch (emailError) {
      res.status(500).json({
        success: false,
        message: "Failed to send OTP email",
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};