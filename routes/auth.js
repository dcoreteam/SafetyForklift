const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto'); // สมมติใช้ scryptSync ในการ hash password

// ตั้งค่าการเชื่อมต่อ PostgreSQL (ปรับค่าให้ตรงกับ DB ของคุณ)
const pool = new Pool({
  user: 'palm',
  host: '203.154.32.219',
  database: 'fm',
  password: 'qwer1234',
  port: 5432,
  idleTimeoutMillis: 30000
});

/* 
  GET /login
  แสดงหน้า login
*/
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

/* 
  POST /login
  ตรวจสอบข้อมูล login
*/
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // ตรวจสอบข้อมูลพื้นฐาน
  if (!username || !password) {
    return res.render('login', { error: 'Please enter both username and password' });
  }
  
  const client = await pool.connect();
  try {
    // ค้นหาผู้ใช้ที่ username ตรงกันและยังไม่ถูกลบ
    const query = `
      SELECT id, username, password, company_id
      FROM users
      WHERE username = $1 AND deleted_at IS NULL
      LIMIT 1
    `;
    const result = await client.query(query, [username]);
    
    if (result.rows.length === 0) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    // ตรวจสอบรหัสผ่าน
    // สมมติว่าใน DB รหัสผ่านถูกเก็บในรูปแบบ hash โดยใช้ scryptSync
    // และ salt อาจเป็น username (ตัวอย่างนี้ ใช้ username เป็น salt)
    const salt = username; // ปรับเปลี่ยนตามที่ระบบของคุณกำหนด
    const hashedPassword = crypto.scryptSync(password, salt, 64).toString('hex');
    
    if (hashedPassword !== user.password) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    // ถ้าการตรวจสอบผ่าน => สร้าง session
    req.session.user = {
      id: user.id,
      username: user.username,
      company_id: user.company_id
    };
    
    res.redirect('/');
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).render('login', { error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/* 
  GET /logout
  ทำการ logout โดยทำลาย session แล้ว redirect ไปหน้า login
*/
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
