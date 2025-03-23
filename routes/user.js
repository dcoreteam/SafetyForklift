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

// 1) แสดงรายการ User (พร้อม JOIN กับตาราง company ถ้าต้องการ)
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT
        u.id AS user_id,
        u.username,
        u.password,
        u.role,
        u.view_map,
        u.create_staff,
        u.company_id,
        c.name AS company_name
      FROM users u
      JOIN company c ON u.company_id = c.id
      WHERE u.deleted_at IS NULL
      ORDER BY u.id ASC
    `;
    const result = await client.query(query);
    const users = result.rows;

    // ดึงรายการ company ทั้งหมด (สำหรับ dropdown เลือก company)
    const companyResult = await client.query(`
      SELECT id, name, customer_code
      FROM company
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);
    const companies = companyResult.rows;

    // render หน้า user_list.ejs
    res.render('user_list_modal', { users, companies });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

// 2) เพิ่มผู้ใช้ (Add)
router.post('/add', async (req, res) => {
  const { username, password, role, company_id, view_map, create_staff } = req.body;
  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO users (
        username, 
        password, 
        role, 
        company_id, 
        view_map, 
        create_staff,
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `;
    await client.query(insertQuery, [
      username,
      password,
      role,
      company_id,
      view_map === 'on',       // ถ้า checkbox ถูกติ๊ก, ค่าจะเป็น 'on' => true
      create_staff === 'on'
    ]);

    res.redirect('/management/user');
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

// 3) แก้ไขผู้ใช้ (Edit)
router.post('/edit/:id', async (req, res) => {
  const userId = req.params.id;
  const { username, password, role, company_id, view_map, create_staff } = req.body;

  const client = await pool.connect();
  try {
    const updateQuery = `
      UPDATE users
      SET
        username = $1,
        password = $2,
        role = $3,
        company_id = $4,
        view_map = $5,
        create_staff = $6,
        updated_at = NOW()
      WHERE id = $7
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [
      username,
      password,
      role,
      company_id,
      view_map === 'on',
      create_staff === 'on',
      userId
    ]);

    res.redirect('/management/user');
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

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
