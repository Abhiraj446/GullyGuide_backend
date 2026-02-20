const express = require("express");
const {
  registerUser,
  verifyOtp,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  updatePassword,
  getUserDetails,
  updateProfile,
  resendOtp,
} = require("../controller/userController");

const { isAuthenticated } = require("../middlewares/auth");
const { uploadAvatar } = require("../middlewares/upload");


const router = express.Router();

/* ================= AUTH ================= */
// router.post("/register", registerUser);
// router.post("/register", uploadAvatar.single('avatar'), registerUser);
 router.post("/register", uploadAvatar.single("avatar"), registerUser);

router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", loginUser);
router.get("/logout", isAuthenticated, logoutUser);

/* ============ PASSWORD ================== */
router.post("/password/forgot", forgotPassword);
router.put("/password/reset/:token", resetPassword);
router.put("/password/update", isAuthenticated, updatePassword);

/* ============ USER PROFILE ============== */
router.get("/me", isAuthenticated, getUserDetails);
router.put("/me/update", isAuthenticated, uploadAvatar.single('avatar'), updateProfile);

module.exports = router;