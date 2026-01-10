const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const upload = require('../middleware/uploadMiddleware'); 
const { verifyToken } = require('../middleware/authMiddleware');

// Bắt buộc đăng nhập cho tất cả các route bên dưới
router.use(verifyToken); 

// 1. Đăng ký xe mới (Có upload ảnh xe)
router.post('/', upload.single('car_image'), vehicleController.addVehicle);

// 2. Lấy thông tin xe của tôi
router.get('/', vehicleController.getMyVehicle);

// 3. Cập nhật thông tin xe
router.put('/:id', upload.single('car_image'), vehicleController.updateVehicle);

// 4. Xóa xe
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;