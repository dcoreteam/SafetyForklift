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
    const { forklift_id, staff_id, severity, start_date, end_date } = req.query;

    // สร้าง query พื้นฐาน
    let baseQuery = `
      SELECT
        il.id AS impact_id,
        f.vehicle_name AS forklift_name,
        s.name AS staff_name,
        il.severity,
        il.g_force,
        il.location,
        TO_CHAR(il.occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at
      FROM impact_log il
      JOIN fleet f ON il.forklift_id = f.id
      JOIN staff s ON il.staff_id = s.id
      WHERE il.deleted_at IS NULL
    `;

    // เตรียม conditions และ params สำหรับกรอง
    let conditions = [];
    let params = [];

    // กรองด้วย forklift_id
    if (forklift_id) {
      conditions.push(`f.id = $${params.length + 1}`);
      params.push(forklift_id);
    }

    // กรองด้วย staff_id
    if (staff_id) {
      conditions.push(`s.id = $${params.length + 1}`);
      params.push(staff_id);
    }

    // กรองด้วย severity
    if (severity) {
      conditions.push(`il.severity ILIKE $${params.length + 1}`);
      params.push(severity);
    }

    // กรองด้วย start_date (occurred_at >= start_date)
    if (start_date) {
      conditions.push(`il.occurred_at >= $${params.length + 1}`);
      params.push(start_date);
    }

    // กรองด้วย end_date (occurred_at < end_date + 1 day)
    if (end_date) {
      conditions.push(`il.occurred_at < ($${params.length + 1}::date + interval '1 day')`);
      params.push(end_date);
    }

    if (conditions.length > 0) {
      baseQuery += ' AND ' + conditions.join(' AND ');
    }

    baseQuery += ' ORDER BY il.id DESC';

    // รัน query
    const result = await client.query(baseQuery, params);
    const impacts = result.rows;

    // ดึงรายการ forklift, staff, severity options (ถ้าต้องการใน dropdown)
    const forkliftResult = await client.query(`
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

    // สมมติ severity มี Low/Medium/High
    const severityOptions = ['Low', 'Medium', 'High'];

    // บันทึกข้อมูลการใช้งาน (Usage Log) เมื่อเข้าชมหน้า Impact Report
    const usageLogQuery = `
      INSERT INTO usage_log (
        user_id,
        event_type,
        event_description,
        ip_address,
        user_agent,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    await client.query(usageLogQuery, [
      req.session.user.id,
      'view_impact',
      'User viewed impact report',
      req.ip,
      req.headers['user-agent'] || ''
    ]);

    res.render('impact_report', {
      impacts,
      forklifts: forkliftResult.rows,
      staffs: staffResult.rows,
      severityOptions,
      filters: {
        forklift_id,
        staff_id,
        severity,
        start_date,
        end_date
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving impact report');
  } finally {
    client.release();
  }
});

module.exports = router;
