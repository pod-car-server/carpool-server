const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');
// ... các dòng require cũ giữ nguyên ...
const adminTransactionController = require('../controllers/adminTransactionController'); 

// Áp dụng bảo mật cho tất cả API admin
router.use(verifyToken);

// --- CÁC ROUTE THỐNG KÊ ---
router.get('/dashboard', adminController.getDashboardStats);
router.get('/revenue', adminController.getRevenueStats);
router.get('/revenue/drivers', adminController.getDriverRevenueStats);
router.get('/revenue/driver/:id', adminController.getDriverRevenueDetail);
router.get('/trips', adminController.getAllTrips);

// --- QUẢN LÝ TÀI XẾ ---
router.get('/drivers', adminController.getAllDrivers);

// 👇 [MỚI THÊM] Route xóa tài xế (Để fix lỗi 404 khi bấm nút Xóa)
router.delete('/drivers/:id', adminController.deleteDriver); 

// Route xử lý trạng thái: 'approve' (duyệt) hoặc 'block' (khóa)
router.post('/drivers/:id/:action', adminController.updateDriverStatus);

// Route cập nhật sữa Full thông tin tài xế (Cá nhân + Xe)
router.put('/drivers/:id', adminController.updateDriver);


// --- QUẢN LÝ VÉ & CHUYẾN ĐI (Hủy vé/chuyến) ---
router.post('/trips/:id/cancel', adminController.cancelTripByAdmin);       
router.post('/bookings/:id/cancel', adminController.cancelBookingByAdmin); 


// --- QUẢN LÝ KHÁCH HÀNG ---
router.get('/passengers', adminController.getAllPassengers);
router.post('/passengers/:id/lock', adminController.lockPassenger); 

// --- CÔNG CỤ KHÁC ---
router.post('/reset-password', adminController.forceResetPassword);

// --- QUẢN LÝ GIAO DỊCH ---
router.get('/transactions', adminTransactionController.getTransactions);
router.post('/transactions/:id/approve', adminTransactionController.approveTransaction);
router.post('/transactions/:id/reject', adminTransactionController.rejectTransaction);

module.exports = router;