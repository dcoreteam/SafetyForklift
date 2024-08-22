const express = require('express');
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true}));

app.post('/login', (req, res) => {
    let data = req.body;
    /*
    {
    "username": "admin",
    "password": "1234",
    "token":"5555"
    }
     */
    //console.log(data);
    if (data.username == "admin" && data.password == "1234" && data.token == "5555")
        res.status(200).send({"Status": "OK"});
    else
        res.status(401).send({"Status": "Fail"});
})
app.listen(3000, () => {
    console.log('app listening on port 3000!')
})