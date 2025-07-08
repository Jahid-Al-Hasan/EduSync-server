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
    // await client.db("admin").command({ ping: 1 });
    console.log("connected to mongodb");
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
