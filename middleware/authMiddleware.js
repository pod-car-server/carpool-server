const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

// --- HÀM MIDDLEWARE XÁC THỰC ---
// Đổi tên thành verifyToken để khớp với bên gọi (routes)
const verifyToken = (req, res, next) => {
    let token;
    
    // 1. Lấy token từ header Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Bạn chưa đăng nhập (Thiếu Token)." });
    }

    try {
        // 2. Giải mã token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 3. Gán user vào request để các hàm phía sau sử dụng
        req.user = decoded; 
        
        next(); // Cho phép đi tiếp
    } catch (err) {
        console.error("Lỗi xác thực Token:", err.message);
        return res.status(401).json({ success: false, message: "Token không hợp lệ hoặc đã hết hạn." });
    }
};

// 👇 QUAN TRỌNG: Phải export dạng Object như thế này 👇
module.exports = { verifyToken };