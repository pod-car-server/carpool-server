const pool = require('../config/db');

exports.createReview = async (req, res) => {
    const client = await pool.connect();
    try {
        // Chấp nhận cả 'rating' hoặc 'stars' để khớp với mọi phiên bản App khách
        const { booking_id, driver_id, rating, stars, comment } = req.body;
        const finalRating = rating || stars; 
        const passenger_id = req.user.id;

        if (!finalRating || !driver_id) {
            return res.status(400).json({ success: false, message: "Thiếu dữ liệu đánh giá" });
        }

        await client.query('BEGIN');

        // 1. Lưu vào bảng reviews (Đảm bảo bảng này tồn tại trong DB)
        await client.query(
            `INSERT INTO reviews (booking_id, driver_id, passenger_id, rating, comment, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [booking_id, driver_id, passenger_id, finalRating, comment]
        );

        // 2. Tính lại điểm trung bình (Dùng COALESCE để tránh lỗi NULL phép tính)
        const updateDriverQuery = `
            UPDATE users 
            SET 
                rating_avg = ROUND(((COALESCE(rating_avg, 5) * total_reviews) + $1)::numeric / (total_reviews + 1), 1),
                total_reviews = total_reviews + 1
            WHERE id = $2
        `;
        await client.query(updateDriverQuery, [finalRating, driver_id]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Cảm ơn bạn đã đánh giá!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Lỗi đánh giá:", err.message);
        res.status(500).json({ success: false, message: "Lỗi server: " + err.message });
    } finally {
        client.release();
    }
};