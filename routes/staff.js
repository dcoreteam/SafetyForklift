const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  user: 'dbuser',
  host: 'localhost',
  database: 'mydatabase',
  password: 'dbpassword',
  port: 5432
});

/* -----------------------------------------
   1) แสดงรายการ Staff (GET /management/staff)
------------------------------------------*/
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    // JOIN ตาราง company, site, shift_time เพื่อแสดงชื่อ
    const query = `
      SELECT
        s.id AS staff_id,
        s.name AS staff_name,
        s.job_title,
        s.phone_no,
        s.email,
        s.department,
        s.address,
        c.name AS company_name,
        c.id AS company_id,
        si.name AS site_name,
        si.id AS site_id,
        st.name AS shift_time_name,
        st.id AS shift_time_id
      FROM staff s
      JOIN company c ON s.company_id = c.id
      LEFT JOIN site si ON s.site_id = si.id
      LEFT JOIN shift_time st ON s.shift_time_id = st.id
      WHERE s.deleted_at IS NULL
      ORDER BY s.id ASC
    `;
    const result = await client.query(query);
    const staffs = result.rows;

    // ดึงรายชื่อ company, site, shift_time (สำหรับ dropdown)
    const companyResult = await client.query(`
      SELECT id, name
      FROM company
      WHERE deleted_at IS NULL
      ORDER BY name
    `);
    const siteResult = await client.query(`
      SELECT id, name
      FROM site
      WHERE deleted_at IS NULL
      ORDER BY name
    `);
    const shiftTimeResult = await client.query(`
      SELECT id, name
      FROM shift_time
      WHERE deleted_at IS NULL
      ORDER BY id
    `);

    const companies = companyResult.rows;
    const sites = siteResult.rows;
    const shiftTimes = shiftTimeResult.rows;

    // render หน้า staff_list_modal.ejs
    res.render('staff_list_modal', { staffs, companies, sites, shiftTimes });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   2) เพิ่ม Staff (Add) (POST /management/staff/add)
------------------------------------------*/
router.post('/add', async (req, res) => {
  const {
    name,
    job_title,
    company_id,
    address,
    phone_no,
    email,
    site_id,
    shift_time_id,
    department
  } = req.body;

  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO staff (
        name,
        job_title,
        company_id,
        address,
        phone_no,
        email,
        site_id,
        shift_time_id,
        department,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `;
    await client.query(insertQuery, [
      name,
      job_title,
      company_id,
      address,
      phone_no,
      email,
      site_id || null,
      shift_time_id || null,
      department
    ]);

    res.redirect('/management/staff');
  } catch (error) {
    console.error('Error adding staff:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3) แก้ไข Staff (Edit) (POST /management/staff/edit/:id)
------------------------------------------*/
router.post('/edit/:id', async (req, res) => {
  const staffId = req.params.id;
  const {
    name,
    job_title,
    company_id,
    address,
    phone_no,
    email,
    site_id,
    shift_time_id,
    department
  } = req.body;

  const client = await pool.connect();
  try {
    const updateQuery = `
      UPDATE staff
      SET
        name = $1,
        job_title = $2,
        company_id = $3,
        address = $4,
        phone_no = $5,
        email = $6,
        site_id = $7,
        shift_time_id = $8,
        department = $9,
        updated_at = NOW()
      WHERE id = $10
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [
      name,
      job_title,
      company_id,
      address,
      phone_no,
      email,
      site_id || null,
      shift_time_id || null,
      department,
      staffId
    ]);

    res.redirect('/management/staff');
  } catch (error) {
    console.error('Error editing staff:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   4) ลบ Staff (Soft Delete) (POST /management/staff/delete/:id)
------------------------------------------*/
router.post('/delete/:id', async (req, res) => {
  const staffId = req.params.id;
  const client = await pool.connect();
  try {
    const deleteQuery = `
      UPDATE staff
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    await client.query(deleteQuery, [staffId]);

    res.redirect('/management/staff');
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

module.exports = router;
