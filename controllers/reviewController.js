const pool = require('../config/db');

exports.createReview = async (req, res) => {
    const client = await pool.connect();
    try {
        // 1. Nhận dữ liệu và ánh xạ (mapping) đúng tên cột của bạn
        // Chấp nhận stars nếu app cũ gửi stars, trip_id nếu app gửi trip_id
        const { booking_id, trip_id, driver_id, reviewee_id, rating, stars, comment } = req.body;
        
        const finalTripId = trip_id || booking_id; // Khớp với trip_id trong DB
        const finalRevieweeId = reviewee_id || driver_id; // Khớp với reviewee_id trong DB
        const finalRating = rating || stars; // Khớp với rating trong DB
        const finalReviewerId = req.user.id; // Chính là reviewer_id

        if (!finalTripId || !finalRevieweeId || !finalRating) {
            return res.status(400).json({ 
                success: false, 
                message: "Thiếu thông tin: trip_id, reviewee_id hoặc rating" 
            });
        }

        await client.query('BEGIN');

        // 2. Chèn vào bảng 'reviews' với đúng tên cột bạn đã cung cấp
        await client.query(
            `INSERT INTO reviews (trip_id, reviewer_id, reviewee_id, rating, comment, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [finalTripId, finalReviewerId, finalRevieweeId, finalRating, comment]
        );

        // 3. Cập nhật điểm trung bình cho tài xế (reviewee)
        // Lưu ý: Tôi dùng tên cột rating_avg và total_reviews, hãy đảm bảo bảng users có 2 cột này
        const updateDriverQuery = `
            UPDATE users 
            SET 
                rating_avg = ROUND(((COALESCE(rating_avg, 5) * total_reviews) + $1)::numeric / (total_reviews + 1), 1),
                total_reviews = total_reviews + 1
            WHERE id = $2
        `;
        await client.query(updateDriverQuery, [finalRating, finalRevieweeId]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Cảm ơn bạn đã đánh giá!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("LỖI SQL CHI TIẾT:", err.message);
        res.status(500).json({ success: false, message: "Lỗi server: " + err.message });
    } finally {
        client.release();
    }
};