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

/* 
  GET /reports/impact
  - รับค่ากรอง forklift_id, staff_id, severity, start_date, end_date
  - JOIN impact_log + forklift + staff
  - แสดงผลใน EJS
*/
router.get('/', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const client = await pool.connect();
  try {
    // รับค่ากรองจาก query string
    let { fleet_id, staff_id, severity, start_date, end_date } = req.query;

    // หากไม่มีการระบุวันที่ ให้กำหนดเป็นวันแรกและวันสุดท้ายของเดือนปัจจุบัน
    const currentDate = new Date();
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    if (!start_date) {
      start_date = firstDay.toISOString().split('T')[0];
    }
    if (!end_date) {
      end_date = lastDay.toISOString().split('T')[0];
    }

    let baseQuery = `
      SELECT
        ul.id AS impact_id,
        f.vehicle_name AS fleet_name,
        s.name AS staff_name,
        ul.severity,
        ul.g_force,
        ul."location" AS location,
        TO_CHAR(ul.occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at
      FROM impact_log ul
      JOIN fleet f ON ul.fleet_id = f.id
      JOIN staff s ON ul.staff_id = s.id
      WHERE ul.deleted_at IS NULL
    `;
    let params = [];
    let conditions = [];

    if (fleet_id) {
      conditions.push(`f.id = $${params.length + 1}`);
      params.push(fleet_id);
    }
    if (staff_id) {
      conditions.push(`s.id = $${params.length + 1}`);
      params.push(staff_id);
    }
    if (severity) {
      conditions.push(`ul.severity ILIKE $${params.length + 1}`);
      params.push(`%${severity}%`);
    }
    // กรองด้วย start_date และ end_date
    if (start_date) {
      conditions.push(`ul.occurred_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`ul.occurred_at < ($${params.length + 1}::date + interval '1 day')`);
      params.push(end_date);
    }

    if (conditions.length > 0) {
      baseQuery += " AND " + conditions.join(" AND ");
    }
    baseQuery += " ORDER BY ul.id DESC";

    // รัน query
    const result = await client.query(baseQuery, params);
    const impacts = result.rows;

    // ดึงรายการ fleet สำหรับ dropdown
    const fleetResult = await client.query(`
      SELECT id, vehicle_name
      FROM fleet
      WHERE deleted_at IS NULL
      ORDER BY vehicle_name
    `);
    const staffResult = await client.query(`
      SELECT id, name
      FROM staff
      WHERE deleted_at IS NULL
      ORDER BY name
    `);
    const severityOptions = ['Low', 'Medium', 'High'];

    res.render('impact_report', {
      impacts,
      fleets: fleetResult.rows,
      staffs: staffResult.rows,
      severityOptions,
      filters: { fleet_id, staff_id, severity, start_date, end_date }
    });
  } catch (err) {
    console.error('Error retrieving impact report:', err);
    res.status(500).send('Error retrieving impact report');
  } finally {
    client.release();
  }
});

module.exports = router;
