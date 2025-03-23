const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'palm',
    host: '203.154.32.219',
    database: 'fm',
    password: 'qwer1234',
    port: 5432,
    idleTimeoutMillis: 30000
  });

/* -----------------------------------------
   1) แสดงรายการ Site (GET /management/site)
   - JOIN กับ company เพื่อดึงชื่อบริษัท
------------------------------------------*/
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT
        s.id AS site_id,
        s.name AS site_name,
        s.contact_person,
        s.contact_phone,
        s.contact_email,
        c.id AS company_id,
        c.name AS company_name
      FROM site s
      JOIN company c ON s.company_id = c.id
      WHERE s.deleted_at IS NULL
      ORDER BY s.id ASC
    `;
    const result = await client.query(query);
    const sites = result.rows;

    // ดึงรายชื่อ company (สำหรับ dropdown เลือก company)
    const companyResult = await client.query(`
      SELECT id, name
      FROM company
      WHERE deleted_at IS NULL
      ORDER BY name
    `);
    const companies = companyResult.rows;

    // render หน้า site_list_modal.ejs
    res.render('site_list_modal', { sites, companies });
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   2) เพิ่ม Site (Add) (POST /management/site/add)
------------------------------------------*/
router.post('/add', async (req, res) => {
  const {
    name,
    company_id,
    contact_person,
    contact_phone,
    contact_email
  } = req.body;

  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO site (
        name,
        company_id,
        contact_person,
        contact_phone,
        contact_email,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `;
    await client.query(insertQuery, [
      name,
      company_id,
      contact_person,
      contact_phone,
      contact_email
    ]);

    res.redirect('/management/site');
  } catch (error) {
    console.error('Error adding site:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3) แก้ไข Site (Edit) (POST /management/site/edit/:id)
------------------------------------------*/
router.post('/edit/:id', async (req, res) => {
  const siteId = req.params.id;
  const {
    name,
    company_id,
    contact_person,
    contact_phone,
    contact_email
  } = req.body;

  const client = await pool.connect();
  try {
    const updateQuery = `
      UPDATE site
      SET
        name = $1,
        company_id = $2,
        contact_person = $3,
        contact_phone = $4,
        contact_email = $5,
        updated_at = NOW()
      WHERE id = $6
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [
      name,
      company_id,
      contact_person,
      contact_phone,
      contact_email,
      siteId
    ]);

    res.redirect('/management/site');
  } catch (error) {
    console.error('Error editing site:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   4) ลบ Site (Soft Delete) (POST /management/site/delete/:id)
------------------------------------------*/
router.post('/delete/:id', async (req, res) => {
  const siteId = req.params.id;
  const client = await pool.connect();
  try {
    const deleteQuery = `
      UPDATE site
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    await client.query(deleteQuery, [siteId]);

    res.redirect('/management/site');
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

module.exports = router;
