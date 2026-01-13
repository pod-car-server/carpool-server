const db = require('../config/db');
const crypto = require('crypto');

// HÀM SINH MÃ MỚI (CHUẨN KHÔNG TRÙNG)
const generateTransCode = () => {
    return 'TRX' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Lấy thông tin ví (Số dư + Lịch sử)
exports.getMyWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        const balanceRes = await db.query("SELECT balance FROM users WHERE id = $1", [userId]);
        const balance = balanceRes.rows[0]?.balance || 0;

        const transRes = await db.query(
            "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", 
            [userId]
        );

        res.json({
            success: true,
            balance: parseFloat(balance),
            transactions: transRes.rows
        });
    } catch (error) {
        console.error("Lỗi lấy ví:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// Nạp tiền
exports.deposit = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount } = req.body;
        
        let proofImage = req.file ? req.file.path.replace(/\\/g, "/") : null;
        
        if (proofImage && proofImage.startsWith('/')) {
            proofImage = proofImage.substring(1);
        }

        if (!amount || parseInt(amount) < 10000) {
            return res.status(400).json({ success: false, message: "Số tiền tối thiểu 10.000đ" });
        }
        
        if (!proofImage) {
            return res.status(400).json({ success: false, message: "Thiếu ảnh minh chứng" });
        }

        const transCode = generateTransCode(); 

        await db.query(
            `INSERT INTO transactions (user_id, amount, type, status, description, proof_image, created_at, code)
             VALUES ($1, $2, 'deposit', 'pending', 'Nạp tiền vào ví', $3, NOW(), $4)`,
            [userId, amount, proofImage, transCode]
        );

        if (req.io) {
            req.io.to("admin_room").emit("new_transaction_alert", {
                message: `🔔 [${transCode}] Tài xế nạp: ${parseInt(amount).toLocaleString('vi-VN')}đ`,
                type: 'deposit',
                code: transCode
            });
        }

        res.json({ success: true, message: "Đã gửi yêu cầu nạp tiền." });
    } catch (error) {
        console.error("Lỗi nạp tiền:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// Rút tiền (ĐÃ FIX LỖI RÚT VƯỢT SỐ DƯ)
exports.withdraw = async (req, res) => {
    const client = await db.connect(); 
    try {
        await client.query('BEGIN');
        
        const userId = req.user.id;
        const { amount } = req.body;
        
        // ✅ SỬA LỖI HIỂN THỊ ẢNH CHO RÚT TIỀN
        let proofImage = req.file ? req.file.path.replace(/\\/g, "/") : '';
        if (proofImage && !proofImage.startsWith('/')) {
            proofImage = '/' + proofImage;
        }

        const requestAmount = parseFloat(amount);

        // 1. Kiểm tra số tiền hợp lệ
        if (!requestAmount || requestAmount < 10000) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Số tiền rút tối thiểu là 10.000đ" });
        }

        // 2. Kiểm tra số dư hiện tại (FOR UPDATE để khóa dòng dữ liệu, tránh rút trùng)
        const balRes = await client.query("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [userId]);
        const currentBalance = parseFloat(balRes.rows[0]?.balance || 0);

        // 🔴 CHẶN TUYỆT ĐỐI RÚT VƯỢT SỐ DƯ
        if (currentBalance < requestAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: `Số dư không đủ! Bạn chỉ có thể rút tối đa ${currentBalance.toLocaleString('vi-VN')}đ` 
            });
        }

        // 3. Trừ tiền ngay lập tức trong Database
        await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [requestAmount, userId]);

        const transCode = generateTransCode();

        // 4. Tạo giao dịch 'pending'
        await client.query(
            `INSERT INTO transactions (user_id, amount, type, status, description, proof_image, created_at, code)
             VALUES ($1, $2, 'withdraw', 'pending', 'Rút tiền về bank', $3, NOW(), $4)`,
            [userId, requestAmount, proofImage, transCode]
        );

        await client.query('COMMIT');

        // 5. Bắn thông báo Realtime cho Admin
        if (req.io) {
            req.io.to("admin_room").emit("new_transaction_alert", {
                message: `🔔 [${transCode}] Tài xế RÚT: ${requestAmount.toLocaleString('vi-VN')}đ`,
                type: 'withdraw',
                code: transCode
            });
        }

        res.json({ success: true, message: "Yêu cầu rút tiền đã được gửi." });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Lỗi rút tiền:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    } finally {
        client.release();
    }
};