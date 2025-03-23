const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto'); // ใช้ generate code หรือจะใช้วิธีอื่น

const pool = new Pool({
    user: 'palm',
    host: '203.154.32.219',
    database: 'fm',
    password: 'qwer1234',
    port: 5432,
    idleTimeoutMillis: 30000
  });

// ฟังก์ชันสำหรับ Generate customer_code ขนาด 10 ตัวอักษร
// ตัวอย่าง: random hex 5 ไบต์ => 10 ตัวอักษร
function generateCustomerCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase(); 
  // ได้ string เช่น "A1B2C3D4E5"
}

/* -----------------------------------------
   1) แสดงรายการ Company (GET /management/company)
------------------------------------------*/
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT
        id AS company_id,
        name,
        address,
        contact_person,
        contact_phone,
        contact_email,
        customer_code
      FROM company
      WHERE deleted_at IS NULL
      ORDER BY id ASC
    `;
    const result = await client.query(query);
    const companies = result.rows;

    // render หน้า company_list_modal.ejs
    res.render('company_list_modal', { companies });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   2) เพิ่ม Company (Add)
   POST /management/company/add
------------------------------------------*/
router.post('/add', async (req, res) => {
  const {
    name,
    address,
    contact_person,
    contact_phone,
    contact_email
    // ไม่รับ customer_code จาก client เพราะจะ generate อัตโนมัติ
  } = req.body;

  // Generate customer_code อัตโนมัติ
  const customer_code = generateCustomerCode();

  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO company (
        name,
        address,
        contact_person,
        contact_phone,
        contact_email,
        customer_code,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `;
    await client.query(insertQuery, [
      name,
      address,
      contact_person,
      contact_phone,
      contact_email,
      customer_code
    ]);

    res.redirect('/management/company');
  } catch (error) {
    console.error('Error adding company:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3) แก้ไข Company (Edit)
   POST /management/company/edit/:id
------------------------------------------*/
router.post('/edit/:id', async (req, res) => {
  const companyId = req.params.id;
  const {
    name,
    address,
    contact_person,
    contact_phone,
    contact_email
    // ไม่รับ customer_code เพราะไม่ให้แก้
  } = req.body;

  const client = await pool.connect();
  try {
    // ไม่อัปเดต customer_code (ตัดออกจากคำสั่ง UPDATE)
    const updateQuery = `
      UPDATE company
      SET
        name = $1,
        address = $2,
        contact_person = $3,
        contact_phone = $4,
        contact_email = $5,
        updated_at = NOW()
      WHERE id = $6
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [
      name,
      address,
      contact_person,
      contact_phone,
      contact_email,
      companyId
    ]);

    res.redirect('/management/company');
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   4) ลบ Company (Soft Delete)
   POST /management/company/delete/:id
------------------------------------------*/
router.post('/delete/:id', async (req, res) => {
  const companyId = req.params.id;

  const client = await pool.connect();
  try {
    const deleteQuery = `
      UPDATE company
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    await client.query(deleteQuery, [companyId]);

    res.redirect('/management/company');
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

module.exports = router;
