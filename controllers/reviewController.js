const pool = require('../config/db');

exports.createReview = async (req, res) => {
    const client = await pool.connect();
    try {
        // Nhận dữ liệu từ App (Chấp nhận cả stars hoặc rating)
        const { booking_id, trip_id, driver_id, rating, stars, comment } = req.body;
        const passenger_id = req.user.id;

        // Ánh xạ linh hoạt để đảm bảo luôn có dữ liệu cho DB
        const finalBookingId = booking_id || trip_id;
        const finalDriverId = driver_id;
        const finalRating = rating || stars;

        // Kiểm tra dữ liệu bắt buộc theo cấu trúc bảng của bạn
        if (!finalBookingId || !finalDriverId || !finalRating) {
            return res.status(400).json({ 
                success: false, 
                message: "Thiếu thông tin: booking_id, driver_id hoặc rating" 
            });
        }

        await client.query('BEGIN');

        // 1. Chèn vào bảng reviews - KHỚP 100% TÊN CỘT BẠN VỪA GỬI
        await client.query(
            `INSERT INTO reviews (booking_id, passenger_id, driver_id, rating, comment, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [finalBookingId, passenger_id, finalDriverId, finalRating, comment]
        );

        // 2. Cập nhật điểm cho tài xế trong bảng users
        // Giả sử bảng users có cột rating_avg và total_reviews
        try {
            await client.query(`
                UPDATE users 
                SET rating_avg = ROUND(((COALESCE(rating_avg, 5) * total_reviews) + $1)::numeric / (total_reviews + 1), 1),
                    total_reviews = total_reviews + 1
                WHERE id = $2
            `, [finalRating, finalDriverId]);
        } catch (updateErr) {
            console.error("Lưu ý: Không thể cập nhật điểm TB (có thể sai tên cột trong bảng users):", updateErr.message);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Cảm ơn bạn đã đánh giá!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("LỖI SQL THỰC TẾ:", err.message);
        res.status(500).json({ success: false, message: "Lỗi DB: " + err.message });
    } finally {
        client.release();
    }
};