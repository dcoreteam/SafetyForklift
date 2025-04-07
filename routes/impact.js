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
    const { fleet_id, staff_id, severity, start_date, end_date } = req.query;
    let baseQuery = `
      SELECT
        il.id AS impact_id,
        f.vehicle_name AS fleet_name,
        s.name AS staff_name,
        il.severity,
        il.g_force,
        il."location" AS location,
        TO_CHAR(il.occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at
      FROM impact_log il
      JOIN fleet f ON il.fleet_id = f.id
      JOIN staff s ON il.staff_id = s.id
      WHERE il.deleted_at IS NULL
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
      conditions.push(`il.severity ILIKE $${params.length + 1}`);
      params.push(`%${severity}%`);
    }
    if (start_date) {
      conditions.push(`il.occurred_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`il.occurred_at < ($${params.length + 1}::date + interval '1 day')`);
      params.push(end_date);
    }
    if (conditions.length > 0) {
      baseQuery += " AND " + conditions.join(" AND ");
    }
    baseQuery += " ORDER BY il.id DESC";

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
    // สมมติ event severity options มี Low/Medium/High
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
