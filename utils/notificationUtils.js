const pool = require('../config/db');

/**
 * Hàm tạo thông báo mới
 * @param {number} user_id - ID người nhận
 * @param {string} title - Tiêu đề thông báo
 * @param {string} message - Nội dung thông báo
 */
exports.createNotification = async (user_id, title, message) => {
    try {
        console.log(`[Notification] Gửi tới User ${user_id}: ${title}`);
        
        // Sửa câu lệnh SQL khớp với bảng đã tạo: (user_id, title, message)
        // Bỏ 'type' và 'reference_id' vì bảng SQL trước đó không có cột này
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, is_read) 
             VALUES ($1, $2, $3, FALSE)`, 
            [user_id, title, message]
        );
        
    } catch (error) {
        // Chỉ log lỗi, không làm crash luồng chính
        console.error('!!! LỖI TẠO THÔNG BÁO:', error.message);
    }
};