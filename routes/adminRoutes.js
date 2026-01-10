const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');
// ... các dòng require cũ giữ nguyên ...
const adminTransactionController = require('../controllers/adminTransactionController'); 

// Áp dụng bảo mật cho tất cả API admin
// Middleware này đảm bảo chỉ Admin có Token hợp lệ mới gọi được các API bên dưới
router.use(verifyToken);

// --- CÁC ROUTE THỐNG KÊ ---
router.get('/dashboard', adminController.getDashboardStats);
router.get('/revenue', adminController.getRevenueStats);
router.get('/revenue/drivers', adminController.getDriverRevenueStats);
router.get('/revenue/driver/:id', adminController.getDriverRevenueDetail);
router.get('/trips', adminController.getAllTrips);

// --- QUẢN LÝ TÀI XẾ ---
router.get('/drivers', adminController.getAllDrivers);

// 👇 admin huỷ vé huỷ chuyến tài xế và khách 
router.post('/trips/:id/cancel', adminController.cancelTripByAdmin);       // Admin hủy chuyến
router.post('/bookings/:id/cancel', adminController.cancelBookingByAdmin); // Admin hủy vé


// Route xử lý trạng thái: 'approve' (duyệt) hoặc 'block' (khóa)
router.post('/drivers/:id/:action', adminController.updateDriverStatus);

// Route cập nhật sữa Full thông tin tài xế (Cá nhân + Xe)
router.put('/drivers/:id', adminController.updateDriver);

// --- QUẢN LÝ KHÁCH HÀNG ---
router.get('/passengers', adminController.getAllPassengers);
router.post('/passengers/:id/lock', adminController.lockPassenger); // Khoá khách hàng

// --- CÔNG CỤ KHÁC ---
router.post('/reset-password', adminController.forceResetPassword);

// 1. Lấy danh sách giao dịch
router.get('/transactions', adminTransactionController.getTransactions);
// 2. Duyệt giao dịch
router.post('/transactions/:id/approve', adminTransactionController.approveTransaction);
// 3. Từ chối giao dịch
router.post('/transactions/:id/reject', adminTransactionController.rejectTransaction);

module.exports = router;