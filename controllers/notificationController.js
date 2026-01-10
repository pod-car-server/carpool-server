const pool = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC", 
            [req.user.id]
        );
        res.json({ success: true, notifications: result.rows });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};

exports.markAsRead = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};