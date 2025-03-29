const { Pool } = require('pg');
const express = require('express');
const cors = require("cors");
const app = express();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userRoutes = require('./routes/user');
app.use('/management/user', userRoutes);

const companyRoutes = require('./routes/company');
app.use('/management/company', companyRoutes);

const staffRoutes = require('./routes/staff');
app.use('/management/staff', staffRoutes);

const fleetRoutes = require('./routes/fleet');
app.use('/management/fleet', fleetRoutes);

const shiftTimeRoutes = require('./routes/shift_time');
app.use('/management/shift_time', shiftTimeRoutes);

const siteRoutes = require('./routes/site');
app.use('/management/site', siteRoutes);

const cardRoutes = require('./routes/card');
app.use('/management/card', cardRoutes);

const impactRoutes = require('./routes/impact');
app.use('/reports/impact', impactRoutes);

const pool = new Pool({
  user: 'palm',
  password: 'qwer1234',
  host: '203.154.32.219',
  port: '5432',
  database: 'fm',
  idleTimeoutMillis: 30000
});

// ตั้งค่า EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ตั้งค่า express-session
app.use(session({
  secret: 'S@fetyForklift',  // เปลี่ยนให้เป็นคีย์ที่ปลอดภัย
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 * 60 } // session ใช้งาน 1 ชั่วโมง
}));

// Import routes login, logout, และ routes อื่น ๆ ที่ต้อง login
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// ตัวอย่าง route อื่น ๆ ที่ต้องมีการตรวจสอบสิทธิ์
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}
app.get('/protected', isAuthenticated, (req, res) => {
  res.send('This is a protected route.');
});

// ตั้งค่า static (ถ้ามีไฟล์ CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า Multer สำหรับอัปโหลดไฟล์
const upload = multer({ dest: 'uploads/' }); // โฟลเดอร์เก็บไฟล์ชั่วคราว

// app.post('/login', async (req, res) => {
//   let data = req.body;
//   /*
//   {
//   "username": "admin",
//   "password": "1234",
//   "token":"5555"
//   }
//    */
//   //console.log(data);
//   const client = await pool.connect();
//   try {

//   } finally {
//     client.release();
//   }
//   if (data.username == "admin" && data.password == "1234" && data.token == "5555")
//     res.status(200).send({ "Status": "OK" });
//   else
//     res.status(401).send({ "Status": "Fail" });
// })

app.post('/createaccount', async (req, res) => {
  const data = req.body;
  const client = await pool.connect();

  try {
    // 1) ตรวจสอบว่ามี email, password, customerCode ครบหรือไม่
    if (!data.email || !data.password || !data.customerCode) {
      return res.status(400).json({
        Status: "Error",
        message: "Missing required fields (email, password, customerCode)"
      });
    }

    // 2) ตรวจสอบว่า customerCode นี้มีในตาราง company หรือไม่
    const companyQuery = `
            SELECT id
            FROM company
            WHERE UPPER(customer_code) = UPPER($1)
                AND deleted_at IS NULL
        `;
    const companyResult = await client.query(companyQuery, [data.customerCode]);
    if (companyResult.rows.length === 0) {
      return res.status(400).json({
        Status: "Error",
        message: "Invalid customer code or company not found"
      });
    }
    const companyId = companyResult.rows[0].id;

    // 3) ตรวจสอบว่า email (username) นี้ มีในตาราง users (ภายใต้ company เดียวกัน) หรือไม่
    const emailCheckQuery = `
            SELECT username
            FROM users
            WHERE username = $1
                AND company_id = $2
                AND deleted_at IS NULL
        `;
    const emailCheckResult = await client.query(emailCheckQuery, [data.email, companyId]);
    if (emailCheckResult.rows.length > 0) {
      return res.status(400).json({
        Status: "Error",
        message: "Email already exists for this company"
      });
    }

    // 4) Hash the password
    //    ใช้ customerCode (ตัวพิมพ์ใหญ่) เป็น salt เพื่อเพิ่มความปลอดภัย
    const salt = data.customerCode.toUpperCase();
    const hashedPassword = crypto.scryptSync(data.password, salt, 64).toString('hex');

    // 5) Insert ลงตาราง users
    //    - ใน schema ใหม่ใช้ฟิลด์ password (ไม่ใช่ password_hash)
    //    - company_id ต้องมาจากตาราง company
    const insertQuery = `
            INSERT INTO users (
                username, 
                password, 
                company_id, 
                created_at, 
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
    const now = new Date();
    const insertResult = await client.query(insertQuery, [
      data.email,        // username
      hashedPassword,    // password
      companyId,         // company_id
      now,               // created_at
      now                // updated_at
    ]);

    // 6) ส่งกลับ response
    res.status(201).json({
      Status: "OK",
      message: "Account created successfully",
      userId: insertResult.rows[0].id
    });

  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      Status: "Error",
      message: "Internal server error"
    });
  } finally {
    client.release();
  }
});

app.post('/deleteaccount', async (req, res) => {
  const data = req.body;
  /*
    data json format
    {
      "email": "admin@mail.com",
      "customerCode": "0987654321"
    }
  */

  const client = await pool.connect();

  try {
    // 1) ตรวจสอบว่า email และ customerCode ถูกส่งมาหรือไม่
    if (!data.email || !data.customerCode) {
      return res.status(400).json({
        Status: "Error",
        message: "Missing required fields (email, customerCode)"
      });
    }

    // 2) หา company_id จากตาราง company โดยใช้ customer_code
    const companyQuery = `
            SELECT id 
            FROM company
            WHERE UPPER(customer_code) = UPPER($1)
                AND deleted_at IS NULL
        `;
    const companyResult = await client.query(companyQuery, [data.customerCode]);
    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        Status: "Error",
        message: "Company not found or invalid customer code"
      });
    }
    const companyId = companyResult.rows[0].id;

    // 3) ตรวจสอบว่ามี user (users) ที่ username = email + company_id ตรงกัน และยังไม่ถูกลบหรือไม่
    const checkQuery = `
            SELECT id 
            FROM users
            WHERE username = $1
                AND company_id = $2
                AND deleted_at IS NULL
        `;
    const checkResult = await client.query(checkQuery, [data.email, companyId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        Status: "Error",
        message: "Account not found or already deleted"
      });
    }

    // 4) ทำ Soft Delete โดยตั้ง deleted_at = ตอนนี้ และอาจตั้ง status อื่น ๆ ตามต้องการ
    const deleteQuery = `
            UPDATE users
            SET deleted_at = $1,
                updated_at = $1
            WHERE username = $2
                AND company_id = $3
                AND deleted_at IS NULL
        `;
    await client.query(deleteQuery, [new Date(), data.email, companyId]);

    // 5) ส่งผลลัพธ์กลับ
    res.status(200).json({
      Status: "OK",
      message: "Account deleted successfully"
    });

  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      Status: "Error",
      message: "Internal server error"
    });
  } finally {
    client.release();
  }
});

app.post('/updateaccount', async (req, res) => {
  const data = req.body;
  /*
    data json format
    {
      "username": "user123",          // Required for identifying the account
      "customerCode": "0987654321",   // Required for identifying the account
      "newPassword": "new_password"   // Required for updating the password
    }
  */

  const client = await pool.connect();
  try {
    // 1) ตรวจสอบว่ามี username, customerCode, newPassword ครบหรือไม่
    if (!data.username || !data.customerCode || !data.newPassword) {
      return res.status(400).json({
        Status: "Error",
        message: "Missing required fields (username, customerCode, newPassword)"
      });
    }

    // 2) หา company_id จากตาราง company โดยใช้ customer_code
    const companyQuery = `
            SELECT id 
            FROM company
            WHERE UPPER(customer_code) = UPPER($1)
                AND deleted_at IS NULL
        `;
    const companyResult = await client.query(companyQuery, [data.customerCode]);
    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        Status: "Error",
        message: "Company not found or invalid customer code"
      });
    }
    const companyId = companyResult.rows[0].id;

    // 3) ตรวจสอบว่ามี user (users) ที่ username = data.username + company_id ตรงกัน และยังไม่ถูกลบหรือไม่
    const checkQuery = `
            SELECT id 
            FROM users
            WHERE username = $1
                AND company_id = $2
                AND deleted_at IS NULL
        `;
    const checkResult = await client.query(checkQuery, [data.username, companyId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        Status: "Error",
        message: "Account not found or already deleted"
      });
    }

    // 4) Hash the new password
    //    ใช้ customerCode (ตัวพิมพ์ใหญ่) เป็น salt เพื่อเพิ่มความปลอดภัย
    //    (แนะนำให้ใช้ bcrypt หรือ argon2 ใน production)
    const salt = data.customerCode.toUpperCase();
    const hashedPassword = crypto
      .scryptSync(data.newPassword, salt, 64)
      .toString('hex');

    // 5) Update password ลงตาราง users
    //    - ฟิลด์ password คือที่เก็บรหัสผ่าน (ตาม schema ล่าสุด)
    //    - อัปเดต updated_at ด้วย
    const updateQuery = `
            UPDATE users
            SET password = $1,
                updated_at = NOW()
            WHERE username = $2
                AND company_id = $3
                AND deleted_at IS NULL
        `;
    await client.query(updateQuery, [hashedPassword, data.username, companyId]);

    // 6) ส่งผลลัพธ์กลับ
    res.status(200).json({
      Status: "OK",
      message: "Password updated successfully"
    });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      Status: "Error",
      message: "Internal server error"
    });
  } finally {
    client.release();
  }
});

function generateUID() {
  return uuidv4().replace(/-/g, '').toUpperCase().slice(0, 10); // ตัดให้เหลือ 10 ตัว
}

app.post('/createcompany', async (req, res) => {
  let data = req.body;

  const client = await pool.connect();

  try {
    // Check if the company already exists and is not deleted
    const result = await client.query(
      'SELECT * FROM company WHERE name = $1 AND deleted_at IS NULL',
      [data.name]
    );

    if (result.rows.length > 0) {
      return res.status(400).json({ Status: "Error", message: "Company already exists" });
    }

    // Insert a new company
    const insertResult = await client.query(
      'INSERT INTO company (name, address, contact_person, contact_phone, contact_email, customer_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [
        data.name,
        data.address,
        data.contactPerson,
        data.contactPhone,
        data.contactEmail,
        generateUID()
      ]
    );

    res.status(201).json({ Status: "OK", message: "Company created successfully", companyId: insertResult.rows[0].id });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/deletecompany', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "name": "company_name"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not already deleted
    const result = await client.query(
      'SELECT id FROM company WHERE name = $1 AND deleted_at IS NULL',
      [data.name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: "Company not found or already deleted" });
    }

    // Soft delete the company
    await client.query(
      'UPDATE company SET deleted_at = $1 WHERE name = $2 AND deleted_at IS NULL',
      [new Date(), data.name]
    );

    res.status(200).json({ Status: "OK", message: "Company deleted successfully" });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/updatecompany', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "name": "company_name", // Required for identifying the company
      "address": "new_address", // Optional
      "contactPerson": "new_contact_person", // Optional
      "contactPhone": "new_contact_phone", // Optional
      "contactEmail": "new_contact_email" // Optional
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(
      'SELECT id FROM company WHERE name = $1 AND deleted_at IS NULL',
      [data.name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: "Company not found or already deleted" });
    }

    // Build dynamic update query
    let updates = [];
    let updateValues = [];
    let index = 1;

    if (data.address) {
      updates.push(`address = $${index}`);
      updateValues.push(data.address);
      index++;
    }

    if (data.contactPerson) {
      updates.push(`contact_person = $${index}`);
      updateValues.push(data.contactPerson);
      index++;
    }

    if (data.contactPhone) {
      updates.push(`contact_phone = $${index}`);
      updateValues.push(data.contactPhone);
      index++;
    }

    if (data.contactEmail) {
      updates.push(`contact_email = $${index}`);
      updateValues.push(data.contactEmail);
      index++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ Status: "Error", message: "No fields to update" });
    }

    // Add WHERE clause values
    updateValues.push(data.name);

    // Execute update query
    const updateQuery = `
            UPDATE company 
            SET ${updates.join(', ')}, updated_at = $${index + 1}
            WHERE name = $${index} AND deleted_at IS NULL
        `;
    await client.query(updateQuery, [...updateValues, new Date()]);

    res.status(200).json({ Status: "OK", message: "Company updated successfully" });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/checkin', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "cardID":"046678C2616080",
      "deviceID":"123456"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(`
            select s.id staff_id, c.id card_id, f.id fleet_id, s."name", s.job_title, s.department, s.company_code, c2."name" company_name, c.uid
            from card c
            left join staff s on c.assigned_staff_id = s.id
            left join fleet f on s.company_id = f.company_id
            left join company c2 on s.company_id = c2.id
            where c.uid = $1 and f.device_id = $2
            and c.deleted_at is null and s.deleted_at is null and c2.deleted_at  is null`,
      [data.cardID, data.deviceID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: `Card ID[${data.cardID}] and device ID[${data.deviceID}] not match.` });
    }

    res.status(200).json({
      Status: "OK",
      message: "Checked in successfully",
      name: result.rows[0].name,
      jobTitle: result.rows[0].job_title,
      department: result.rows[0].department,
      companyCode: result.rows[0].company_code,
      companyName: result.rows[0].company_name,
      staffId: result.rows[0].staff_id,
      cardID: result.rows[0].uid
    });
  } catch (error) {
    console.error('Error shift in:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/shiftin', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "cardID":"046678C2616080",
      "deviceID":"123456",
      "shiftIn":"2025-02-23 01:00"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(`
            select s.id staff_id, c.id card_id, f.id fleet_id, s."name", s.job_title, s.department, s.company_code, c2."name" company_name, c.uid
            from card c
            left join staff s on c.assigned_staff_id = s.id
            left join fleet f on s.company_id = f.company_id
            left join company c2 on s.company_id = c2.id
            where c.uid = $1 and f.device_id = $2
            and c.deleted_at is null and s.deleted_at is null and c2.deleted_at  is null`,
      [data.cardID, data.deviceID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: "cardID and deviceID not match." });
    }

    // Execute update query
    // Insert a new company
    const insertResult = await client.query(
      'INSERT INTO shift_log (staff_id, card_id, fleet_id, check_in) VALUES ($1, $2, $3, $4) RETURNING id',
      [
        result.rows[0].staff_id,
        result.rows[0].card_id,
        result.rows[0].fleet_id,
        data.shiftIn
      ]
    );

    res.status(201).json({
      Status: "OK",
      message: "Shift in successfully",
      shiftId: insertResult.rows[0].id,
      name: result.rows[0].name,
      jobTitle: result.rows[0].job_title,
      department: result.rows[0].department,
      companyCode: result.rows[0].company_code,
      companyName: result.rows[0].company_name,
      staffId: result.rows[0].staff_id,
      cardID: result.rows[0].uid
    });
  } catch (error) {
    console.error('Error shift in:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/shiftout', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "shiftId": 3,
      "shiftOut":"2025-02-23 01:00"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(`
            select *
            from shift_log
            where id = $1 and check_out is null`,
      [data.shiftId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: "Shift not found." });
    }

    // Execute update query
    const updateQuery = `
            UPDATE shift_log 
            SET check_out = $1, updated_at = $2
            WHERE id = $3 AND deleted_at IS NULL
        `;
    await client.query(updateQuery, [data.shiftOut, new Date(), data.shiftId]);

    res.status(200).json({ Status: "OK", message: "Shift out successfully" });
  } catch (error) {
    console.error('Error shift in:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/getimage/:staffId", async (req, res) => {
  const staff_id = req.params.staffId;
  const client = await pool.connect();

  try {
    const result = await client.query(`
            SELECT image
            FROM staff
            WHERE id = $1 AND deleted_at IS NULL`,
      [staff_id]
    );

    if (result.rows.length === 0 || !result.rows[0].image) {
      return res.status(404).json({ Status: "Error", message: "Image not found." });
    }

    const imageBuffer = result.rows[0].image;

    res.writeHead(200, {
      "Content-Type": "image/jpeg", // Change this if needed
      "Content-Length": imageBuffer.length
    });
    res.end(imageBuffer);

  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ Status: "Error", message: "Internal server error." });
  } finally {
    client.release(); // Ensure connection is released
  }
});

app.post('/getDeviceInfo', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "deviceID":"123456"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(`
            select f.id, f.vehicle_name, f.vehicle_type, f.vehicle_status, f.make, f.model, f.year, c.name company_name
            from fleet f
            left join company c on f.company_id = c.id
            where f.device_id = $1
            and f.deleted_at is null and c.deleted_at is null`,
      [data.deviceID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ Status: "Error", message: "deviceID not match." });
    }

    res.status(200).json({
      Status: "OK",
      message: "Get device info successfully",
      vehicleName: result.rows[0].vehicle_name,
      vehicleType: result.rows[0].vehicle_type,
      vehicleStatus: result.rows[0].vehicle_status,
      make: result.rows[0].make,
      model: result.rows[0].model,
      year: result.rows[0].year,
      companyName: result.rows[0].company_name,
      fleetID: result.rows[0].id
    });
  } catch (error) {
    console.error('Error get device info:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post('/registerDevice', async (req, res) => {
  let data = req.body;

  /*
  data json format:
  {
      "deviceID":"123456"
  }
  */

  const client = await pool.connect();

  try {
    // Check if the company exists and is not deleted
    const result = await client.query(`
            select f.id, f.vehicle_name, f.vehicle_type, f.vehicle_status, f.make, f.model, f.year, f.is_registered
            from fleet f
            where f.device_id = $1
            and f.deleted_at is null`,
      [data.deviceID]
    );

    if (result.rows.length === 0) {
      const result = await client.query(`
                insert into fleet(device_id, is_registered) values($1, false)
                `, [data.deviceID]);
      return res.status(200).json({ Status: "OK", message: "Register device successfully", is_registered: false });
    }

    res.status(200).json({
      Status: "OK",
      message: "Device allready register",
      is_registered: result.rows[0].is_registered
    });
  } catch (error) {
    console.error('Error register device:', error);
    res.status(500).json({ Status: "Error", message: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/getTest", async (req, res) => {
  res.status(200).json({ Status: "OK" });
});

/* --------------------------------------------
 2.1. ฟังก์ชันช่วยสร้าง Query สำหรับ Shift Log
     ตามเงื่อนไขที่ผู้ใช้กรอก
-------------------------------------------- */
function buildShiftQuery(filters) {
  /*
    filters = {
      company_id: (string|undefined),
      card_uid: (string|undefined),
      staff_name: (string|undefined),
      fleet_name: (string|undefined), // <-- เพิ่มตัวนี้
      start_date: (string|undefined),
      end_date: (string|undefined)
    }
  */

  let baseQuery = `
      SELECT
        sl.id AS shift_log_id,
        st.name AS staff_name,
        c2.name AS company_name,
        card.uid AS card_uid,
        f.vehicle_name AS fleet_name,
        TO_CHAR(sl.check_in, 'YYYY-MM-DD HH24:MI:SS') AS check_in,
        TO_CHAR(sl.check_out, 'YYYY-MM-DD HH24:MI:SS') AS check_out
      FROM shift_log sl
      JOIN staff st ON sl.staff_id = st.id
      JOIN company c2 ON st.company_id = c2.id
      JOIN card ON sl.card_id = card.id
      JOIN fleet f ON sl.fleet_id = f.id
    `;

  let conditions = [];
  let params = [];

  // Filter: company_id
  if (filters.company_id) {
    conditions.push(`c2.id = $${params.length + 1}`);
    params.push(filters.company_id);
  }

  // Filter: card_uid
  if (filters.card_uid) {
    conditions.push(`card.uid ILIKE $${params.length + 1}`);
    params.push(`%${filters.card_uid}%`);
  }

  // Filter: staff_name
  if (filters.staff_name) {
    conditions.push(`st.name ILIKE $${params.length + 1}`);
    params.push(`%${filters.staff_name}%`);
  }

  // Filter: fleet_name (ใหม่)
  if (filters.fleet_name) {
    conditions.push(`f.vehicle_name ILIKE $${params.length + 1}`);
    params.push(`%${filters.fleet_name}%`);
  }

  // Filter: start_date
  if (filters.start_date) {
    conditions.push(`sl.check_in >= $${params.length + 1}`);
    params.push(filters.start_date);
  }

  // Filter: end_date
  if (filters.end_date) {
    conditions.push(`sl.check_in < ($${params.length + 1}::date + interval '1 day')`);
    params.push(filters.end_date);
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  // เรียงตาม ID
  baseQuery += ` ORDER BY sl.id DESC`;

  return { queryString: baseQuery, params };
}

/* --------------------------------------------
 2.2. Route แสดงหน้า /shifts (GET)
      พร้อมกรองข้อมูลตาม query string
-------------------------------------------- */
app.get('/reports/shifts', async (req, res) => {
  const client = await pool.connect();
  try {
    // ดึงค่า filters จาก query string
    const { company_id, card_uid, staff_name, start_date, end_date } = req.query;
    const filters = { company_id, card_uid, staff_name, start_date, end_date };

    // สร้าง query
    const { queryString, params } = buildShiftQuery(filters);

    // รัน query
    const result = await client.query(queryString, params);

    // ดึงรายชื่อ company มาแสดงใน dropdown filter
    const companyResult = await client.query(`
            SELECT id, name
            FROM company
            WHERE deleted_at IS NULL
            ORDER BY name ASC
        `);

    res.render('shifts', {
      shifts: result.rows,
      companies: companyResult.rows,
      filters
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving shift log data');
  } finally {
    client.release();
  }
});

/* --------------------------------------------
 2.3. Route Export CSV (GET)
      Export ตามเงื่อนไขเดียวกัน (Filter)
-------------------------------------------- */
app.get('/reports/shifts/export/csv', async (req, res) => {
  const client = await pool.connect();
  try {
    // รับค่า filters เหมือน /shifts
    const { company_id, card_uid, staff_name, start_date, end_date } = req.query;
    const filters = { company_id, card_uid, staff_name, start_date, end_date };

    // สร้าง query ด้วยฟังก์ชันเดียวกัน
    const { queryString, params } = buildShiftQuery(filters);
    const result = await client.query(queryString, params);

    // ตั้ง Header ให้ browser ดาวน์โหลดเป็น CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="shifts.csv"');

    // สร้าง Header ของ CSV
    let csvContent = 'Shift ID,Staff Name,Company,Card UID,Fleet Name,Check In,Check Out\n';

    // Loop ใส่ข้อมูล
    result.rows.forEach(shift => {
      // ใส่ "" เพื่อกัน comma ที่อาจมีในข้อความ
      csvContent += [
        shift.shift_log_id,
        `"${shift.staff_name}"`,
        `"${shift.company_name}"`,
        `"${shift.card_uid}"`,
        `"${shift.fleet_name}"`,
        shift.check_in,
        shift.check_out
      ].join(',') + '\n';
    });

    // ส่ง CSV กลับ
    res.send(csvContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error exporting CSV');
  } finally {
    client.release();
  }
});

/* --------------------------------------------
 2.4. Route Export Excel (GET)
      Export ตามเงื่อนไขเดียวกัน (Filter)
-------------------------------------------- */
app.get('/reports/shifts/export/excel', async (req, res) => {
  const client = await pool.connect();
  try {
    // รับค่า filters
    const { company_id, card_uid, staff_name, start_date, end_date } = req.query;
    const filters = { company_id, card_uid, staff_name, start_date, end_date };

    // สร้าง query ด้วยฟังก์ชันเดียวกัน
    const { queryString, params } = buildShiftQuery(filters);
    const result = await client.query(queryString, params);

    // สร้างไฟล์ Excel ด้วย exceljs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shifts');

    // กำหนดคอลัมน์ (Header)
    worksheet.columns = [
      { header: 'Shift ID', key: 'shift_log_id', width: 10 },
      { header: 'Staff Name', key: 'staff_name', width: 20 },
      { header: 'Company', key: 'company_name', width: 20 },
      { header: 'Card UID', key: 'card_uid', width: 20 },
      { header: 'Fleet Name', key: 'fleet_name', width: 20 },
      { header: 'Check In', key: 'check_in', width: 20 },
      { header: 'Check Out', key: 'check_out', width: 20 }
    ];

    // ใส่ข้อมูลใน Worksheet
    result.rows.forEach(shift => {
      worksheet.addRow({
        shift_log_id: shift.shift_log_id,
        staff_name: shift.staff_name,
        company_name: shift.company_name,
        card_uid: shift.card_uid,
        fleet_name: shift.fleet_name,
        check_in: shift.check_in,
        check_out: shift.check_out
      });
    });

    // ตั้ง Header ให้ Browser ดาวน์โหลดไฟล์ Excel
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="shifts.xlsx"');

    // เขียนไฟล์ลงใน stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Error exporting Excel');
  } finally {
    client.release();
  }
});

app.get('/admin', (req, res) => {
  // อาจตรวจสอบสิทธิ์ (Auth) ก่อน
  // if (!req.user || req.user.role !== 'admin') return res.redirect('/login');
  res.render('admin_home');
});

app.get('/admin/import', (req, res) => {
  res.render('admin_import');
});

app.post('/admin/import', upload.single('importFile'), async (req, res) => {
  try {
    // 1) ตรวจสอบว่าไฟล์ถูกอัปโหลดมาหรือไม่
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    // 2) req.file.path = path ของไฟล์ที่ถูกอัปโหลดในโฟลเดอร์ 'uploads/'
    //    สามารถนำไป parse (CSV/Excel) ได้ตามต้องการ
    //    เช่น ถ้าเป็น CSV ใช้ fast-csv หรือถ้าเป็น Excel ใช้ exceljs

    // ตัวอย่าง (สมมติ parse CSV):
    // const fs = require('fs');
    // const csv = require('fast-csv');
    // fs.createReadStream(req.file.path)
    //   .pipe(csv.parse({ headers: true }))
    //   .on('data', row => {
    //     console.log(row);
    //     // TODO: บันทึก row ลงฐานข้อมูล
    //   })
    //   .on('end', rowCount => {
    //     console.log(`Parsed ${rowCount} rows`);
    //   });

    // 3) เสร็จแล้ว redirect กลับไปหน้า admin หรือจะแจ้งผลลัพธ์ก็ได้
    res.redirect('/admin');
  } catch (err) {
    console.error('Error importing data:', err);
    res.status(500).send('Error importing data');
  }
});

app.listen(8000, () => {
  console.log('app listening on port', 8000)
})