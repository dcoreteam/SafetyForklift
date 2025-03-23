const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// ตั้งค่าการเชื่อมต่อ PostgreSQL (ปรับตามจริง)
const pool = new Pool({
  user: 'palm',
  host: '203.154.32.219',
  database: 'fm',
  password: 'qwer1234',
  port: 5432,
  idleTimeoutMillis: 30000
});

/* -----------------------------------------
   1) แสดงรายการผู้ใช้ (GET /management/user)
------------------------------------------*/
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    // ดึงข้อมูลผู้ใช้ที่ยังไม่ถูกลบ (deleted_at IS NULL)
    const result = await client.query(`
      SELECT *
      FROM users
      WHERE deleted_at IS NULL
      ORDER BY id ASC
    `);
    const users = result.rows;

    res.render('user_list', { users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   2) แสดงฟอร์มเพิ่มผู้ใช้ (GET /management/user/add)
------------------------------------------*/
router.get('/add', (req, res) => {
  // ส่งหน้าฟอร์มเปล่า ๆ ไป (user_form.ejs) ในโหมด "Add"
  res.render('user_form', { user: null, formMode: 'add' });
});

/* -----------------------------------------
   2.1) รับข้อมูลจากฟอร์ม "เพิ่มผู้ใช้" (POST /management/user/add)
------------------------------------------*/
router.post('/add', async (req, res) => {
  const { username, password, role, company_id } = req.body;

  const client = await pool.connect();
  try {
    // ตัวอย่าง: ยังไม่ได้ Hash Password
    const insertQuery = `
      INSERT INTO users (username, password, role, company_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `;
    await client.query(insertQuery, [username, password, role, company_id]);
    res.redirect('/management/user');
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3) แสดงฟอร์มแก้ไขผู้ใช้ (GET /management/user/edit/:id)
------------------------------------------*/
router.get('/edit/:id', async (req, res) => {
  const userId = req.params.id;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT *
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }
    const user = result.rows[0];

    // ส่ง user_form.ejs ในโหมด "edit"
    res.render('user_form', { user, formMode: 'edit' });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3.1) รับข้อมูลจากฟอร์ม "แก้ไขผู้ใช้" (POST /management/user/edit/:id)
------------------------------------------*/
router.post('/edit/:id', async (req, res) => {
  const userId = req.params.id;
  const { username, password, role, company_id } = req.body;

  const client = await pool.connect();
  try {
    const updateQuery = `
      UPDATE users
      SET username = $1,
          password = $2,
          role = $3,
          company_id = $4,
          updated_at = NOW()
      WHERE id = $5
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [username, password, role, company_id, userId]);

    res.redirect('/management/user');
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   4) ลบผู้ใช้ (POST /management/user/delete/:id)
      - ใช้ Soft Delete โดยตั้ง deleted_at = NOW()
------------------------------------------*/
router.post('/delete/:id', async (req, res) => {
  const userId = req.params.id;
  const client = await pool.connect();
  try {
    const deleteQuery = `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    await client.query(deleteQuery, [userId]);
    res.redirect('/management/user');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

module.exports = router;
