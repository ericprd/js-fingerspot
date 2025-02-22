const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

const port = 3001

const device = {
    ac: process.env.AC,
    SN: process.env.SN,
    VC: process.env.VC,
    VKEY: process.env.VKEY,
}

console.log(device)

const getDeviceByAcSn = async () => {
    return [{
        ac: device.ac,
        sn: device.sn,
        vkey: device.vkey,
    }]
}

const getDeviceBySn = async () => {
    return [{
        ac: '',
        vkey: '',
    }]
}

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())

app.get('/getac', async (req, res) => {
    try {
        const data = await getDeviceByAcSn()
        if (data.length > 0) res.send(`${data[0].ac}${data[0].sn}`)
        else req.status(404).send("No Data Found")
    } catch (error) {
        res.status(500).send('Server Error')
    }
})

app.get('/register', async (req, res) => {
    const { user_id } = req.query

    if (!user_id)
        return res.status(400).send("Missing user_id parameter")

    const time_limit_reg = 10
    const base_path = 'http://localhost:3001/'
    const securityKey = 'helloWorld'
    res.send(`${user_id};${securityKey};${time_limit_reg};${base_path}process_register;${base_path}getac`)
})

app.post('/process_register', async (req, res) => {
    const { RegTemp } = req.body

    if (!RegTemp)
        return res.status(400).send('missing RegTemp parameter')
    const data = RegTemp.split(';')
    console.log('data', data)
    console.log('data 3', data[3])

    res.send("Success")
})

app.listen(port, () => {
    console.log(`Server run on http://localhost:${port}`)
})
