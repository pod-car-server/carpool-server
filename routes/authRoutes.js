const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const uploadCloud = require('../middleware/uploadCloudinary'); 

// 👇 QUAN TRỌNG: Phải có dấu { } để lấy hàm verifyToken ra từ object
const { verifyToken } = require('../middleware/authMiddleware'); 

// --- CÁC ROUTE ---

// 1. Đăng ký (Dùng uploadCloud)
router.post(
  "/register",
  (req, res, next) => {
    if (!req.headers["content-type"]?.includes("multipart")) {
      return next(); // ✅ passenger không upload ảnh
    }

    uploadCloud.fields([
      { name: "avatar", maxCount: 1 },
      { name: "license", maxCount: 1 },
      { name: "vehicle_registration", maxCount: 1 },
    ])(req, res, next);
  },
  authController.register
);


// 2. Đăng nhập
router.post('/login', authController.login);

// 3. Lấy thông tin cá nhân (Dùng verifyToken)
router.get('/profile', verifyToken, authController.getProfile);

// 4. Cập nhật hồ sơ (Dùng verifyToken + uploadCloud)
router.put('/profile', 
    verifyToken, 
    uploadCloud.single('avatar'), 
    authController.updateProfile
);

module.exports = router;