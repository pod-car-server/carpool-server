const express = require('express');
const router = express.Router();

// 1. Import Middleware xác thực và upload
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // Middleware xử lý ảnh

// 2. Import Controller (Nơi chứa logic Nạp/Rút chuẩn có chờ duyệt)
const walletController = require('../controllers/walletController');

// --- ĐỊNH NGHĨA ROUTES ---

// Lấy thông tin ví (Số dư + Lịch sử)
// GET /api/wallet/my
router.get('/my', verifyToken, walletController.getMyWallet);

// Nạp tiền (Có upload ảnh minh chứng)
// POST /api/wallet/deposit
router.post('/deposit', verifyToken, upload.single('proof_image'), walletController.deposit);

// Rút tiền (Có upload ảnh mã QR nhận tiền)
// POST /api/wallet/withdraw
router.post('/withdraw', verifyToken, upload.single('proof_image'), walletController.withdraw);

module.exports = router;