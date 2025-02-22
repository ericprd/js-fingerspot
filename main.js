const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sqlite = require("sqlite3").verbose();

const app = express();

const baseUrl = process.env.BASE_URL;
const port = process.env.PORT;

const device = {
  ac: process.env.AC,
  SN: process.env.SN,
  VC: process.env.VC,
  VKEY: process.env.VKEY,
};

const db = new sqlite.Database("./db/database.sqlite", (err) => {
  if (err) {
    console.error("Error opening database");
  } else {
    console.log("Successfuly connected to database");
  }
});

db.serialize(() => {
  db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL
      )
    `);

  db.run(`
      CREATE TABLE IF NOT EXISTS fingers (
        finger_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        finger_data TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
});

const getDeviceByAcSn = async () => {
  return [
    {
      ac: device.ac,
      sn: device.sn,
      vkey: device.vkey,
    },
  ];
};

const getDeviceBySn = async () => {
  return [
    {
      ac: device.ac,
      vkey: device.VKEY,
    },
  ];
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.get("/getac", async (req, res) => {
  try {
    const data = await getDeviceByAcSn();
    if (data.length > 0) res.send(`${data[0].ac}${data[0].sn}`);
    else req.status(404).send("No Data Found");
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

app.get("/register", async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) return res.status(400).send("Missing user_id parameter");

  const time_limit_reg = 10;
  const base_path = `${baseUrl}:${port}`;
  const securityKey = "helloWorld";
  res.send(
    `${user_id};${securityKey};${time_limit_reg};${base_path}process_register;${base_path}getac`,
  );
});

app.post("/process_register", async (req, res) => {
  const { RegTemp } = req.body;

  if (!RegTemp) return res.status(400).send("missing RegTemp parameter");
  const data = RegTemp.split(";");
  const vStamp = data[0];
  const sn = data[1];
  const user_id = data[2];
  const regTemp = data[3];

  const fingers = [];

  const device = await getDeviceBySn();
  if (!device || device.length === 0)
    return res.status(404).send("Device not found");

  const salt = require("crypto")
    .createHash("md5")
    .update(device[0].ac + device[0].vkey + regTemp + sn + user_id)
    .digest("hex");

  if (vStamp?.toUpperCase() === salt.toUpperCase()) {
    db.all(
      "SELECT MAX(finger_id) as fid FROM fingers WHERE user_id=?",
      [user_id],
      (err, rows) => {
        if (err) {
          res.status(500).json({ message: err.message });
        } else {
          fingers.push(rows);
        }
      },
    );

    console.log();
  }

  res.json({ message: "success" });
});

app.get("/verify", async (req, res) => {
  const { user_id } = req.params;
  if (!user_id) return res.status(400).send("Missing user_id parameter");
});

app.listen(port, () => {
  console.log(`Server run on ${baseUrl}:${port}`);
});
