const pool = require('../config/db');

exports.createReview = async (req, res) => {
    const client = await pool.connect();
    try {
        const { booking_id, driver_id, rating, comment } = req.body;
        const passenger_id = req.user.id;

        await client.query('BEGIN');

        // 1. Lưu đánh giá vào bảng reviews
        await client.query(
            `INSERT INTO reviews (booking_id, driver_id, passenger_id, rating, comment)
             VALUES ($1, $2, $3, $4, $5)`,
            [booking_id, driver_id, passenger_id, rating, comment]
        );

        // 2. Tính lại điểm trung bình cho Tài xế
        // Công thức: ((Điểm cũ * số lượt cũ) + Điểm mới) / (Số lượt cũ + 1)
        const updateDriverQuery = `
            UPDATE users 
            SET 
                rating_avg = ((rating_avg * total_reviews) + $1) / (total_reviews + 1),
                total_reviews = total_reviews + 1
            WHERE id = $2
        `;
        await client.query(updateDriverQuery, [rating, driver_id]);

        await client.query('COMMIT');
        
        res.json({ success: true, message: "Cảm ơn bạn đã đánh giá!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        client.release();
    }
};