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
	user: 'postgres',
	password: 'S@afetyForklift',
	host: '119.59.103.151',
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

    try {
        const client = await pool.connect();

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
        const client = await pool.connect().catch(() => null);
        client?.release();
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

    try {
        const client = await pool.connect();

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
        const client = await pool.connect().catch(() => null);
        client?.release();
    }
});

function generateUID() {
    return uuidv4().replace(/-/g, '').toUpperCase().slice(0, 10); // ตัดให้เหลือ 10 ตัว
}

app.post('/createcompany', async (req, res) => {
    let data = req.body;
    //console.log(data);
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM fm_company WHERE name = $1', [data.name]);
    //console.log(result);
    if (result.rows > 0) {
        result.status(401).json({Status: "Error"});
    } else {
        const result = await client.query('INSERT INTO fm_company(name, address, contact_person, contact_phone, contact_email, create_at, update_at, customer_code) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [data.name, data.address, data.contactPerson, data.contactPhone, data.contactEmail, new Date(), new Date(), generateUID()]
        )
    }
    client.release();
    res.status(201).json({Status: "OK"}); 
})

app.listen(3000, () => {
    console.log('app listening on port', 3000)
})