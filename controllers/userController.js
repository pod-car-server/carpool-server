// userController.js
const pool = require('../config/db');

// Cập nhật Push Token (Để gửi thông báo)
exports.updatePushToken = async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.id; // Lấy ID từ token đăng nhập

        if (!token) {
            return res.status(400).json({ message: "Thiếu token" });
        }
        
        // Lưu token vào database
        await pool.query("UPDATE users SET push_token = $1 WHERE id = $2", [token, userId]);
        
        console.log(`✅ Đã lưu Push Token cho User ID ${userId}`);
        res.json({ success: true, message: "Đã lưu token thông báo" });
    } catch (err) {
        console.error("Lỗi lưu token:", err);
        res.status(500).json({ message: "Lỗi server khi lưu token" });
    }
};