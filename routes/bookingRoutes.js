const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { verifyToken } = require('../middleware/authMiddleware');

// TẤT CẢ CÁC ROUTE DƯỚI ĐÂY ĐỀU CẦN ĐĂNG NHẬP

// 1. Đặt vé mới
router.post('/', verifyToken, bookingController.createBooking);

// 2. Lấy danh sách vé của tôi
router.get('/my', verifyToken, bookingController.getMyBookings);

// 3. Hủy vé
router.put('/:id/cancel', verifyToken, bookingController.cancelBooking);

// 4. Đón khách
router.put('/:id/pickup', verifyToken, bookingController.pickUpPassenger);

module.exports = router;