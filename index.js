const { Pool } = require('pg');
const express = require('express');
const cors = require("cors");
const app = express();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
    user: 'palm',
    password: 'qwer1234',
    host: '203.154.32.219',
    port: '5432',
    database: 'fm',
    idleTimeoutMillis: 30000
});

app.set('view engine', 'ejs');

app.post('/login', async (req, res) => {
    let data = req.body;
    /*
    {
    "username": "admin",
    "password": "1234",
    "token":"5555"
    }
     */
    //console.log(data);
    const client = await pool.connect();
    try {

    } finally {
        client.release();
    }
    if (data.username == "admin" && data.password == "1234" && data.token == "5555")
        res.status(200).send({ "Status": "OK" });
    else
        res.status(401).send({ "Status": "Fail" });
})

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
    let data = req.body;

    /*
    data json format
    {
        "email": "admin@mail.com",
        "customerCode":"0987654321"
    }
    */

    const client = await pool.connect();

    try {


        if (!data.email || !data.customerCode) {
            return res.status(400).json({ Status: "Error", message: "Missing required fields" });
        }

        // Check if account exists and is not already deleted
        const checkQuery = `
            SELECT id 
            FROM fm_user 
            WHERE username = $1 
              AND customer_code = $2 
              AND deleted_at IS NULL
        `;
        const checkResult = await client.query(checkQuery, [data.email, data.customerCode.toUpperCase()]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ Status: "Error", message: "Account not found or already deleted" });
        }

        // Perform soft delete
        const deleteQuery = `
            UPDATE fm_user 
            SET deleted_at = $1, status = 0 
            WHERE username = $2 
              AND customer_code = $3
        `;
        await client.query(deleteQuery, [new Date(), data.email, data.customerCode.toUpperCase()]);

        res.status(200).json({ Status: "OK", message: "Account deleted successfully" });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ Status: "Error", message: "Internal server error" });
    } finally {
        client.release();
    }
});

app.post('/updateaccount', async (req, res) => {
    let data = req.body;

    /*
    data json format
    {
        "username": "user123",         // Required for identifying the account
        "customerCode": "0987654321",  // Required for identifying the account
        "newPassword": "new_password" // Required for updating the password
    }
    */
    const client = await pool.connect();

    try {


        // Validate required fields
        if (!data.username || !data.customerCode || !data.newPassword) {
            return res.status(400).json({ Status: "Error", message: "Missing required fields" });
        }

        // Check if account exists and is not deleted
        const checkQuery = `
            SELECT id 
            FROM fm_user 
            WHERE username = $1 
              AND customer_code = $2 
              AND deleted_at IS NULL
        `;
        const checkResult = await client.query(checkQuery, [data.username, data.customerCode.toUpperCase()]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ Status: "Error", message: "Account not found or already deleted" });
        }

        // Hash the new password
        const hashedPassword = crypto
            .scryptSync(data.newPassword, data.customerCode.toUpperCase(), 64)
            .toString('hex');

        // Update password
        const updateQuery = `
            UPDATE fm_user 
            SET password_hash = $1, update_at = $2
            WHERE username = $3 
              AND customer_code = $4
        `;
        await client.query(updateQuery, [hashedPassword, new Date(), data.username, data.customerCode.toUpperCase()]);

        res.status(200).json({ Status: "OK", message: "Password updated successfully" });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ Status: "Error", message: "Internal server error" });
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

app.get('/shifts', async (req, res) => {
    try {
        const query = `
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
            ORDER BY sl.id DESC
        `;
        const result = await pool.query(query);
        res.render('shifts', { shifts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving shift log data');
    }
});

// -------------- EXPORT CSV --------------
app.get('/shifts/export/csv', async (req, res) => {
    try {
        // ดึงข้อมูลเหมือนด้านบน
        const query = `
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
        ORDER BY sl.id DESC
        `;
        const result = await pool.query(query);
        const shiftsData = result.rows;

        // กำหนด Header ให้ Browser ดาวน์โหลดไฟล์เป็น CSV
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="shifts.csv"');

        // สร้าง CSV ขึ้นมาเอง (แบบง่าย ๆ)
        // 1) สร้าง Header
        let csvContent = 'Shift ID,Staff Name,Company Name,Card UID,Fleet Name,Check In,Check Out\n';

        // 2) Loop ข้อมูล shiftsData เพื่อสร้างแต่ละแถว
        shiftsData.forEach(shift => {
            csvContent += [
                shift.shift_log_id,
                `"${shift.staff_name}"`,    // ใส่ "" เผื่อมี comma ในชื่อ
                `"${shift.company_name}"`,
                shift.card_uid,
                `"${shift.fleet_name}"`,
                shift.check_in,
                shift.check_out
            ].join(',') + '\n';
        });

        // 3) ส่ง CSV ออกไป
        res.send(csvContent);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error exporting CSV');
    }
});

// -------------- EXPORT EXCEL --------------
app.get('/shifts/export/excel', async (req, res) => {
    try {
        // ดึงข้อมูลเหมือนด้านบน
        const query = `
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
        ORDER BY sl.id DESC
        `;
        const result = await pool.query(query);
        const shiftsData = result.rows;

        // สร้างไฟล์ Excel ด้วย exceljs
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Shifts');

        // กำหนดหัวตาราง (Header)
        worksheet.columns = [
            { header: 'Shift ID', key: 'shift_log_id', width: 10 },
            { header: 'Staff Name', key: 'staff_name', width: 20 },
            { header: 'Company Name', key: 'company_name', width: 20 },
            { header: 'Card UID', key: 'card_uid', width: 15 },
            { header: 'Fleet Name', key: 'fleet_name', width: 20 },
            { header: 'Check In', key: 'check_in', width: 20 },
            { header: 'Check Out', key: 'check_out', width: 20 },
        ];

        // ใส่ข้อมูลใน Worksheet
        shiftsData.forEach(shift => {
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

        // กำหนด Header ให้ Browser ดาวน์โหลดไฟล์เป็น Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="shifts.xlsx"');

        // เขียนไฟล์ Excel ลงใน Stream แล้วส่งกลับไปยัง Client
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).send('Error exporting Excel');
    }
});

app.listen(8000, () => {
    console.log('app listening on port', 8000)
})