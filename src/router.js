const express = require('express')
const { transactions, listen } = require('./wallet')
const { default: axios } = require('axios')

const app = express()

app.get('/v1/exchange/get-rate', async (req, res) => {
    try {
        const result = await axios.get(process.env.SWAPZONE_GETRATE_URL, {
            params: req.query,
            headers: {
                "X-API-KEY": process.env.SWAPZONE_API_KEY
            }
        })
        if(result.data.error)
            throw new Error(result.data.message)
        res.json(result.data)
    } catch(ex) {
        res.json({
            message: ex.message
        })
    }
})

app.post('/v1/exchange/create', async (req, res) => {
    try {
        const result = await axios.post(process.env.SWAPZONE_CREATE_URL, req.body, {
            headers: {
                "X-API-KEY": process.env.SWAPZONE_API_KEY
            }
        })
        if(result.data.error)
            throw new Error(result.data.message)
        const transaction = result.data.transaction
        listen(transaction)
        res.json({ transaction })
    } catch(ex) {
        res.json({
            message: ex.message
        })
    }
})

app.get('/v1/exchange/tx', async (req, res) => {
    try {
        const transaction = transactions[req.query.id]
        res.json({ transaction })
    } catch(ex) {
        res.json({
            message: ex.message
        })
    }
})

module.exports = app