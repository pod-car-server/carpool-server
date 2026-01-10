const db = require('../config/db'); // Kết nối PostgreSQL (Pool)

// 1. API DUYỆT GIAO DỊCH (APPROVE)
exports.approveTransaction = async (req, res) => {
    const transactionId = req.params.id;
    
    // PostgreSQL: Phải lấy client từ pool để dùng Transaction
    const client = await db.connect();

    try {
        await client.query('BEGIN'); // Bắt đầu transaction

        // B1: Lấy thông tin giao dịch để biết ai là người nạp/rút
        const { rows } = await client.query("SELECT * FROM transactions WHERE id = $1 FOR UPDATE", [transactionId]);
        const transaction = rows[0];

        if (!transaction) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
        }

        if (transaction.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Giao dịch này đã được xử lý trước đó" });
        }

        // B2: Xử lý cộng tiền (Nếu là nạp)
        if (transaction.type === 'deposit') {
            // ==> NẠP TIỀN: Cộng tiền vào ví tài xế
            await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [transaction.amount, transaction.user_id]);
        } 
        // Nếu là Withdraw thì tiền đã trừ lúc tạo lệnh rồi, không cần trừ nữa.

        // B3: Cập nhật trạng thái giao dịch thành COMPLETED
        await client.query("UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1", [transactionId]);

        // B4: Lưu lại (Commit)
        await client.query('COMMIT');

        // 👇👇👇 [QUAN TRỌNG] BẮN SOCKET BÁO VỀ CHO TÀI XẾ 👇👇👇
        if (req.io) {
            const roomName = `driver_${transaction.user_id}`;
            console.log(`🔔 [APPROVE] Đang bắn tin về phòng: ${roomName}`); // <--- LOG KIỂM TRA

            req.io.to(roomName).emit("wallet_updated", {
                message: "✅ Yêu cầu nạp/rút tiền của bạn đã được DUYỆT!",
                type: 'success',
                transaction_id: transactionId
            });
        } else {
            console.log("❌ LỖI: Không tìm thấy req.io trong adminController");
        }
        // 👆👆👆 KẾT THÚC PHẦN SOCKET 👆👆👆

        return res.json({ success: true, message: "Đã duyệt giao dịch thành công!" });

    } catch (error) {
        await client.query('ROLLBACK'); 
        console.error(error);
        return res.status(500).json({ success: false, message: "Lỗi server khi duyệt giao dịch" });
    } finally {
        client.release(); 
    }
};

// 2. API TỪ CHỐI GIAO DỊCH (REJECT)
exports.rejectTransaction = async (req, res) => {
    const transactionId = req.params.id;
    const { reason } = req.body; 

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // B1: Lấy thông tin
        const { rows } = await client.query("SELECT * FROM transactions WHERE id = $1 FOR UPDATE", [transactionId]);
        const transaction = rows[0];

        if (!transaction || transaction.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Giao dịch không hợp lệ hoặc đã xử lý" });
        }

        // B2: Hoàn tiền nếu là Rút tiền
        if (transaction.type === 'withdraw') {
            await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [transaction.amount, transaction.user_id]);
        }

        // B3: Cập nhật trạng thái REJECTED
        await client.query(
            "UPDATE transactions SET status = 'rejected', note = $1, updated_at = NOW() WHERE id = $2", 
            [reason || 'Admin từ chối', transactionId]
        );

        await client.query('COMMIT');

        // 👇👇👇 [QUAN TRỌNG] BẮN SOCKET BÁO TỪ CHỐI 👇👇👇
        if (req.io) {
            const roomName = `driver_${transaction.user_id}`;
            console.log(`🔔 [REJECT] Đang bắn tin về phòng: ${roomName}`);

            req.io.to(roomName).emit("wallet_updated", {
                message: `❌ Yêu cầu giao dịch bị từ chối. Lý do: ${reason || 'Admin hủy'}`,
                type: 'error'
            });
        }
        // 👆👆👆

        return res.json({ success: true, message: "Đã từ chối giao dịch." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        return res.status(500).json({ success: false, message: "Lỗi server khi từ chối" });
    } finally {
        client.release();
    }
};

// 3. API LẤY DANH SÁCH GIAO DỊCH
exports.getTransactions = async (req, res) => {
    try {
        const { status } = req.query;
        let sql = `
            SELECT t.*, u.full_name as driver_name, u.phone_number as driver_phone 
            FROM transactions t 
            LEFT JOIN users u ON t.user_id = u.id 
        `;
        
        const params = [];
        if (status && status !== 'all') {
            sql += " WHERE t.status = $1"; 
            params.push(status);
        }
        
        sql += " ORDER BY t.created_at DESC";

        const { rows } = await db.query(sql, params); 

        res.json({ success: true, transactions: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Lỗi lấy danh sách" });
    }
};