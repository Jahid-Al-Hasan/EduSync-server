const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3001;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const admin = require("firebase-admin");
// const serviceAccount = require("./firebaseServiceAccountKey.json");

// middlewares
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// firebase admin credentials
const decoded = Buffer.from(process.env.FIREBASE_KEY_BASE64, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

    // custom middlewares
    const verifyFirebaseToken = async (req, res, next) => {
      const authHeader = req?.headers?.authorization;

      // 1. Check for Authorization header
      if (!authHeader?.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ message: "Unauthorized access - no token provided" });
      }

      const token = authHeader.split(" ")[1];

      try {
        // 2. Verify the token using Firebase Admin SDK
        const decodedUser = await admin.auth().verifyIdToken(token);

        // 3. Attach decoded user to the request
        req.user = decodedUser;

        // 4. Proceed to next middleware or route
        next();
      } catch (error) {
        console.error("Token verification failed:", error.message); // helpful in dev
        return res
          .status(403)
          .json({ message: "Forbidden - invalid or expired token" });
      }
    };

    // ✅ Protected route example
    app.get("/data", verifyFirebaseToken, async (req, res) => {
      // Optional: Access UID or email from decoded token
      const { uid, email } = req.user;
      res.json({ message: "Token verified", uid, email });
    });

    // create user
    app.post("/api/registerUser", verifyFirebaseToken, async (req, res) => {
      try {
        const { email, role, lastSignIn } = req.body;

        // ✅ Basic validation
        if (!email || !role || !lastSignIn) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        if (req.body.email !== req.user.email) {
          return res
            .status(403)
            .json({ message: "Email is not varified by firebase" });
        }

        if (role !== "student" && role !== "tutor") {
          return res
            .status(401)
            .json({ message: "User must be student or tutor" });
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

    // GET /api/userRole?email=user@example.com
    app.get("/api/userRole", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ role: user.role });
      } catch (error) {
        console.error("Failed to fetch role:", error.message);
        res.status(500).json({ message: "Internal server error" });
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
