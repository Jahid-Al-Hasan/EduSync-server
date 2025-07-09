const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3001;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

// middlewares
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // databases
    const db = client.db("edusyncDB");
    const usersCollection = db.collection("users");

    // create user
    app.post("/api/registerUser", async (req, res) => {
      try {
        const { email, role, lastSignIn } = req.body;

        // ✅ Basic validation
        if (!email || !role || !lastSignIn) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const userExists = await usersCollection.findOne({ email });
        if (userExists) {
          return res.status(409).json({ message: "User already exists" });
        }

        const newUser = {
          email,
          role,
          CreatedAt: new Date().toISOString(),
          lastSignIn,
        };
        const result = await usersCollection.insertOne(newUser);
        if (!result.insertedId) {
          return res.status(401).json({ message: "Registration failed" });
        }
        res.status(200).send(result);
      } catch (error) {
        console.log(error.message);
      }
    });
    // await client.db("admin").command({ ping: 1 });
    // console.log("connected to mongodb");
  } catch (error) {
    console.log(error);
  } finally {
    // await client.close();
  }
}

run();

app.get("/", (req, res) => {
  res.send("Server connected successfully");
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server is running locally on port ${port}`);
  });
}
