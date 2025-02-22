const { Pool } = require('pg');
const express = require('express');
const cors = require("cors");
const app = express();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true}));

const pool = new Pool({
	user: 'palm',
	password: 'qwer1234',
	host: '203.154.32.219',
	port: '5432',
	database: 'fm',
    idleTimeoutMillis: 30000
});

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
        res.status(200).send({"Status": "OK"});
    else
        res.status(401).send({"Status": "Fail"});
})

app.post('/createaccount', async (req, res) => {
    let data = req.body;
    const client = await pool.connect();

    try {
        

        if (!data.email || !data.password || !data.customerCode) {
            return res.status(400).json({ Status: "Error", message: "Missing required fields" });
        }

        // Check for duplicate email that is not deleted
        const emailCheckQuery = `
            SELECT username 
            FROM fm_user 
            WHERE username = $1 
              AND customer_code = $2 
              AND deleted_at IS NULL
        `;
        const emailCheckResult = await client.query(emailCheckQuery, [data.email, data.customerCode.toUpperCase()]);
        if (emailCheckResult.rows.length > 0) {
            return res.status(400).json({ Status: "Error", message: "Email already exists" });
        }

        // Hash the password
        const hashedPassword = crypto.scryptSync(data.password, data.customerCode.toUpperCase(), 64).toString('hex');

        // Insert into database
        const insertQuery = `
            INSERT INTO fm_user (username, email, password_hash, customer_code, create_at, update_at, status)
            VALUES ($1, $1, $2, $3, $4, $5, 1) RETURNING id
        `;
        const insertResult = await client.query(insertQuery, [data.email, hashedPassword, data.customerCode, new Date(), new Date()]);

        res.status(201).json({ Status: "OK", message: "Account created successfully", userId: insertResult.rows[0].id });
    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ Status: "Error", message: "Internal server error" });
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
            select s.id staff_id, c.id card_id, f.id fleet_id, s."name", s.job_title, c2."name" company_name, c.uid
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

app.get("/getimage/:staffId", async (req, res) => {
    const staff_id = req.params.staffId;
    const client = await pool.connect();
    const result = await client.query(`
        select image
        from staff
        where id = $1 and deleted_at is null`,
        [staff_id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ Status: "Error", message: "Image not found." });
    }

    res.writeHead(200, {
        "Content-Type": "image/jpg",
        "Content-Length": result.rows[0].image.length
    })
    res.end(result.rows[0].image)
    return
})

app.listen(8000, () => {
    console.log('app listening on port', 8000)
})