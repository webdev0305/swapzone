const express = require('express')
const app = express()
const cors = require('cors')
const bodyParser = require('body-parser')
const router = require('./src/router')
const wallet = require('./src/wallet')
require('dotenv').config()

app.use(cors({
    origin: '*'
}))
app.use(bodyParser.json())
app.use(router)

app.listen(8000, () => {
    console.log("Swapzone is started!")
})
wallet.init()