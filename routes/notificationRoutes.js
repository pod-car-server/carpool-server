const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

// Áp dụng xác thực
router.use(verifyToken); 

// 1. Lấy danh sách thông báo
router.get('/', notificationController.getNotifications);

// 2. Đánh dấu đã đọc
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;