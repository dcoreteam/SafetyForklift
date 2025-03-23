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
   1) แสดงรายการ Fleet (GET /management/fleet)
------------------------------------------*/
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    // JOIN ตาราง company, site, checklist เพื่อแสดงชื่อ
    const query = `
      SELECT
        f.id AS fleet_id,
        f.vehicle_name,
        f.vehicle_type,
        f.make,
        f.model,
        f.year,
        f.vehicle_status,
        f.device_id,
        f.is_registered,
        c.id AS company_id,
        c.name AS company_name,
        s.id AS site_id,
        s.name AS site_name,
        ch.id AS checklist_id,
        ch.name AS checklist_name
      FROM fleet f
      LEFT JOIN company c ON f.company_id = c.id
      LEFT JOIN site s ON f.site_id = s.id
      LEFT JOIN checklist ch ON f.checklist_id = ch.id
      WHERE f.deleted_at IS NULL
      ORDER BY f.id ASC
    `;
    const result = await client.query(query);
    const fleets = result.rows;

    // ดึงรายชื่อ company, site, checklist (สำหรับ dropdown)
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
    const checklistResult = await client.query(`
      SELECT id, name
      FROM checklist
      WHERE deleted_at IS NULL
      ORDER BY id
    `);

    const companies = companyResult.rows;
    const sites = siteResult.rows;
    const checklists = checklistResult.rows;

    // render หน้า fleet_list_modal.ejs
    res.render('fleet_list_modal', { fleets, companies, sites, checklists });
  } catch (error) {
    console.error('Error fetching fleet:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   2) เพิ่ม Fleet (Add) (POST /management/fleet/add)
------------------------------------------*/
router.post('/add', async (req, res) => {
  const {
    vehicle_name,
    vehicle_type,
    make,
    model,
    year,
    checklist_id,
    vehicle_status,
    company_id,
    site_id,
    device_id,
    is_registered
  } = req.body;

  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO fleet (
        vehicle_name,
        vehicle_type,
        make,
        model,
        year,
        checklist_id,
        vehicle_status,
        company_id,
        site_id,
        device_id,
        is_registered,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `;
    await client.query(insertQuery, [
      vehicle_name,
      vehicle_type,
      make,
      model,
      year || null,
      checklist_id || null,
      vehicle_status,
      company_id || null,
      site_id || null,
      device_id,
      is_registered === 'on'
    ]);

    res.redirect('/management/fleet');
  } catch (error) {
    console.error('Error adding fleet:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   3) แก้ไข Fleet (Edit) (POST /management/fleet/edit/:id)
------------------------------------------*/
router.post('/edit/:id', async (req, res) => {
  const fleetId = req.params.id;
  const {
    vehicle_name,
    vehicle_type,
    make,
    model,
    year,
    checklist_id,
    vehicle_status,
    company_id,
    site_id,
    device_id,
    is_registered
  } = req.body;

  const client = await pool.connect();
  try {
    const updateQuery = `
      UPDATE fleet
      SET
        vehicle_name = $1,
        vehicle_type = $2,
        make = $3,
        model = $4,
        year = $5,
        checklist_id = $6,
        vehicle_status = $7,
        company_id = $8,
        site_id = $9,
        device_id = $10,
        is_registered = $11,
        updated_at = NOW()
      WHERE id = $12
        AND deleted_at IS NULL
    `;
    await client.query(updateQuery, [
      vehicle_name,
      vehicle_type,
      make,
      model,
      year || null,
      checklist_id || null,
      vehicle_status,
      company_id || null,
      site_id || null,
      device_id,
      is_registered === 'on',
      fleetId
    ]);

    res.redirect('/management/fleet');
  } catch (error) {
    console.error('Error editing fleet:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

/* -----------------------------------------
   4) ลบ Fleet (Soft Delete) (POST /management/fleet/delete/:id)
------------------------------------------*/
router.post('/delete/:id', async (req, res) => {
  const fleetId = req.params.id;
  const client = await pool.connect();
  try {
    const deleteQuery = `
      UPDATE fleet
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    await client.query(deleteQuery, [fleetId]);

    res.redirect('/management/fleet');
  } catch (error) {
    console.error('Error deleting fleet:', error);
    res.status(500).send('Internal server error');
  } finally {
    client.release();
  }
});

module.exports = router;
