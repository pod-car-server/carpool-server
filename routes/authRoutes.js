const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware'); 
const { verifyToken } = require('../middleware/authMiddleware'); 

// Cấu hình upload cho Đăng ký (Avatar + Bằng lái + giấy tờ xe)
const registerUploads = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'license', maxCount: 1 },
    { name: 'vehicle_registration', maxCount: 1 }
]);

// 1. Đăng ký
router.post('/register', registerUploads, authController.register); 

// 2. Đăng nhập
router.post('/login', authController.login); 

// 3. Lấy thông tin cá nhân (Sửa lỗi 500 bằng cách chạy SQL ở bước 1)
// Lưu ý: Đảm bảo trong authController có hàm getProfile hoặc getMe
router.get('/profile', verifyToken, authController.getProfile);

// 4. 👇 QUAN TRỌNG: Thêm Route Cập nhật hồ sơ (PUT)
// Frontend gửi lên với field name là 'avatar'
router.put('/profile', verifyToken, upload.single('avatar'), authController.updateProfile);

module.exports = router;