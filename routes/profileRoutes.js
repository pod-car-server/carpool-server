const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const upload = require('../middleware/uploadMiddleware'); 
const { verifyToken } = require('../middleware/authMiddleware');

// Bắt buộc đăng nhập
router.use(verifyToken); 

// 1. Lấy thông tin cá nhân
router.get('/', profileController.getUserProfile);

// 2. Cập nhật thông tin (Có upload avatar)
router.put('/', upload.single('avatar'), profileController.updateUserProfile);

// 3. Đổi mật khẩu
router.put('/change-password', profileController.changePassword);

module.exports = router;