const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Lấy thông tin user

exports.getUserProfile = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, full_name, email, phone_number, role, avatar_url FROM users WHERE id = $1", 
            [req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};

// Cập nhật thông tin

exports.updateUserProfile = async (req, res) => {
    const userId = req.user.id;
    const { full_name, phone_number } = req.body;
    let avatarUrl = null;

    if (req.file) {
        // Lưu đường dẫn ảnh (Windows dùng \\ nên cần replace thành /)
        avatarUrl = `/uploads/${req.file.filename}`;
    }

    let client;
    try {
        client = await pool.connect();
        
        // 1. Tạo câu truy vấn động (chỉ update cái nào có dữ liệu)
        let query = "UPDATE users SET full_name = $1";
        const params = [full_name];
        let idx = 2;

        if (phone_number) {
            query += `, phone_number = $${idx++}`;
            params.push(phone_number);
        }

        if (avatarUrl) {
            query += `, avatar_url = $${idx++}`;
            params.push(avatarUrl);
        }

        query += ` WHERE id = $${idx} RETURNING id, full_name, phone_number, avatar_url, role`;
        params.push(userId);

        const result = await client.query(query, params);
        
        // Cập nhật xong trả về thông tin mới
        res.json({ 
            success: true, 
            message: "Cập nhật thành công!", 
            user: result.rows[0] 
        });

    } catch (err) {
        // --- XỬ LÝ LỖI TRÙNG SỐ ĐIỆN THOẠI ---
        if (err.code === '23505') { // Mã lỗi trùng lặp của PostgreSQL
            return res.status(400).json({ 
                success: false, 
                message: "Số điện thoại này đã được sử dụng bởi tài khoản khác." 
            });
        }
        // -------------------------------------
        
        console.error("Lỗi update profile:", err);
        res.status(500).json({ message: "Lỗi server khi cập nhật hồ sơ." });
    } finally {
        if (client) client.release();
    }
};

// Đổi mật khẩu

exports.changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const userRes = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
        const user = userRes.rows[0];

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "Mật khẩu cũ không đúng" });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, req.user.id]);
        res.json({ success: true, message: "Đổi mật khẩu thành công" });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};