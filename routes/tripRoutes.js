const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { verifyToken } = require('../middleware/authMiddleware');

// --- 1. CÁC ROUTE TĨNH (STATIC ROUTES) - ĐẶT TRÊN CÙNG ---

// Thống kê thu nhập & Sao (Mới thêm)
router.get('/stats', verifyToken, tripController.getDriverStats);

// Tìm kiếm chuyến xe
router.get('/search', verifyToken, tripController.searchTrips);

// Lấy danh sách chuyến của Tài xế
router.get('/driver', verifyToken, tripController.getDriverTrips);

// Tạo chuyến xe mới
router.post('/', verifyToken, tripController.createTrip);


// --- 2. CÁC ROUTE ĐỘNG (DYNAMIC ROUTES WITH :id) - ĐẶT DƯỚI ---

// Lấy chi tiết hành khách của 1 chuyến
router.get('/:id', verifyToken, tripController.getTripDetails);

// Bắt đầu chuyến đi
router.put('/:id/start', verifyToken, tripController.startTrip);

// Hoàn thành chuyến đi
router.put('/:id/complete', verifyToken, tripController.completeTrip);

// Hủy chuyến đi
router.put('/:id/cancel', verifyToken, tripController.cancelTrip);

module.exports = router;