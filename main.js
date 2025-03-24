const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sqlite = require("sqlite3").verbose();

const app = express();

const baseUrl = process.env.BASE_URL;
const port = process.env.PORT;

const securityKey = process.env.SECURITY_KEY;
const time_limit = process.env.TIME_LIMIT;

const device = {
  ac: process.env.AC,
  SN: process.env.SN,
  VC: process.env.VC,
  VKEY: process.env.VKEY,
};

const db = new sqlite.Database("./db/db.sqlite", (err) => {
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

const getFromDB = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const getAllFromDB = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const getUserFingers = async (user_id) => {
  const data = await getAllFromDB("SELECT * FROM fingers WHERE user_id=?", [
    user_id,
  ]);

  return data;
};

// get uru4500 device detail by account and serial number
const getDeviceByAcSn = async () => {
  return [
    {
      ac: device.ac,
      sn: device.sn,
      vkey: device.vkey,
    },
  ];
};

// get uru4500 device detail by serial number
const getDeviceBySn = async () => {
  return [
    {
      ac: device.ac,
      vkey: device.VKEY,
      vc: device.VC,
    },
  ];
};

// hash the fingerprint data
const hash = (params) =>
  require("crypto").createHash("md5").update(params).digest("hex");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// route to get fingerprint device that wil be used by fingerspot
app.get("/getac", async (req, res) => {
  try {
    // get the device detail by account and serial number
    const data = await getDeviceByAcSn();
    if (data.length > 0) res.send(`${data[0].ac}${data[0].sn}`);
    else req.status(404).send("No Data Found");
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

app.post("/register-user", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: "username is empty" });
  }

  const user = await getFromDB("SELECT username FROM users WHERE username=?", [
    username,
  ]);

  if (user) {
    return res.status(429).json({ message: "username already exist" });
  }

  const stmt = db.prepare("INSERT INTO users (username) VALUES(?)");
  stmt.run(username, (err) => {
    if (err) {
      res.status(400).json({ message: `register failed: ${err}` });
    } else {
      res.status(201).json({ message: "user registered" });
    }
  });
});

// route to register fingerprint and bind the user id to the fingerprint
app.get("/register", async (req, res) => {
  const { user_id } = req.query;
  console.log('user', user_id)

  if (!user_id) return res.status(400).send("Missing user_id parameter");

  const base_path = `${baseUrl}:${port}`;

  // this response will be used by fingerspot
  // the format will be
  // <id user>;<the security key for hashing>;<time limit to get finger data>;<route to process finger data from fingerspot>;<route to get device detail>
  const response = `${user_id};${securityKey};${time_limit};${base_path}/process_register;${base_path}/getac`;

  // send it as response and the fingerspot will access it automatically
  res.send(response);
});

// this is route to process finger data from fingerspot
// the data will be set to as RegTemp by fingerspot
app.post("/process_register", async (req, res) => {
  const { RegTemp } = req.body;

  console.log('dfasdfasdf', RegTemp)

  if (!RegTemp) return res.status(400).send("missing RegTemp parameter");

  // split the RegTemp by ';'
  // the index 0 will be vStamp
  // index 1 is the device serial number
  // index 2 is the user id
  // and index 3 is the finger data
  const data = RegTemp.split(";");
  const vStamp = data[0];
  const sn = data[1];
  const user_id = data[2];
  const regTemp = data[3];

  // get device by serial number
  const device = await getDeviceBySn();
  if (!device || device.length === 0)
    return res.status(404).send("Device not found");

  // hash it, this is will be the data that we stored in our DB
  const salt = hash(device[0].ac + device[0].vkey + regTemp + sn + user_id);

  // check if the hashed value is equal to vStamp
  if (vStamp?.toUpperCase() === salt.toUpperCase()) {
    // check the finger id that registered to the user
    const { fid } = await getFromDB(
      "SELECT MAX(finger_id) as fid FROM fingers WHERE user_id=?",
      [user_id],
    );

    // if the finger id is empty then the user has not registered their finger
    if (fid === 0 || !fid) {
      const stmt = db.prepare(
        "INSERT INTO fingers (user_id, finger_data) VALUES(?,?)",
      );
      stmt.run(user_id, regTemp, (err) => {
        if (err) {
          res.send("error");
        } else {
          res.send("success");
        }
      });
    } else {
      res.status(429).json({ message: "Template already exist" });
    }
  }
});

// this is used to verify the user fingerprint
app.get("/verification", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).send("Missing user_id parameter");

  const data = await getUserFingers(user_id);
  const resp = `${user_id};${data[0]?.finger_data};${securityKey};${time_limit};${baseUrl}:${port}/process_verification;${baseUrl}:${port}/getac;`;

  res.send(resp);
});

app.post("/process_verification", async (req, res) => {
  const { VerPas } = req.body;

  if (!VerPas) return res.status(400).send("missing VerPas parameter");
  const data = VerPas.split(";");
  const user_id = data[0];
  const vStamp = data[1];
  const time = data[2];
  const sn = data[3];

  const finger = await getUserFingers(user_id);
  const device = await getDeviceBySn();

  const salt = hash(
    sn +
      finger[0]?.finger_data +
      device[0].vc +
      time +
      user_id +
      device[0].vkey,
  );

  if (vStamp?.toUpperCase() === salt.toUpperCase()) {
    res.send(`berhasil`);
  } else {
    res.send(`failed`);
  }
});

app.listen(port, () => {
  console.log(`Server run on ${baseUrl}:${port}`);
});
