const { Pool } = require('pg');
const express = require('express');
const cors = require("cors");
const app = express();

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

app.post('/createcompany', async (req, res) => {
    let data = req.body;
    //console.log(data);
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM fm_company WHERE name = $1', [data.name]);
    //console.log(result);
    if (result.rows > 0) {
        result.status(401).json({"Status": "OK"});
    } else {
        
        const result = await client.query('INSERT INTO fm_company(name, address, contact_person, contact_phone, contact_email, create_at, update_at) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [data.name, data.address, data.contactPerson, data.contactPhone, data.contactEmail, new Date(), new Date()]
        )
    }
    client.release();
    res.status(201).json({"Status": "OK"}); 
})

app.listen(3000, () => {
    console.log('app listening on port', 3000)
})