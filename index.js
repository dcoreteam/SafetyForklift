const { Pool } = require('pg');
const express = require('express');
const cors = require("cors");
const app = express();
const { v4: uuidv4 } = require('uuid');

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
    /*
    data json format
    {
        "email": "admin@mail.com",
        "password": "1234",
        "customerCode":"0987654321"
    }
    */

    try {
        // เชื่อมต่อกับฐานข้อมูล
        const client = await pool.connect();

        // ตรวจสอบว่า request body ครบถ้วน
        if (!data.email || !data.password || !data.customerCode) {
            return res.status(400).json({ Status: "Error", Detail: "Missing required fields" });
        }

        // ตรวจสอบว่ามี email ซ้ำในระบบหรือไม่
        const emailCheckQuery = 'SELECT username FROM tm_user WHERE username = $1';
        const emailCheckResult = await client.query(emailCheckQuery, [data.email]);
        if (emailCheckResult.rows.length > 0) {
            return res.status(400).json({ Status: "Error", Detail: "Email already exists" });
        }

        // เข้ารหัส (Hash) รหัสผ่าน
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);

        // บันทึกข้อมูลลงฐานข้อมูล
        const insertQuery = `
            INSERT INTO users (username, password_hash, customer_code)
            VALUES ($1, $2, $3) RETURNING id
        `;
        const insertResult = await client.query(insertQuery, [data.email, hashedPassword, data.customerCode]);

        // ส่งผลลัพธ์กลับ
        res.status(201).json({ message: "Account created successfully", userId: insertResult.rows[0].id });
    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        // ปล่อยการเชื่อมต่อฐานข้อมูล
        const client = await pool.connect().catch(() => null); // ป้องกัน client ไม่มีในกรณี error ก่อน client ถูกประกาศ
        client?.release();
    }
})

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
        const result = await client.query('INSERT INTO fm_company(name, address, contact_person, contact_phone, contact_email, create_at, update_at, company_code) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [data.name, data.address, data.contactPerson, data.contactPhone, data.contactEmail, new Date(), new Date(), generateUID()]
        )
    }
    client.release();
    res.status(201).json({Status: "OK"}); 
})

app.listen(3000, () => {
    console.log('app listening on port', 3000)
})