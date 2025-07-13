const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3001;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
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
    const sessionCollections = db.collection("study-sessions");
    const reviewsCollection = db.collection("reviews");
    const bookedSessionsCollection = db.collection("booked-sessions");

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
        // console.log(req, user);

        // 4. Proceed to next middleware or route
        next();
      } catch (error) {
        console.error("Token verification failed:", error.message); // helpful in dev
        return res
          .status(403)
          .json({ message: "Forbidden - invalid or expired token" });
      }
    };
    // verify student
    // Middleware to verify if user is a student
    const verifyStudent = async (req, res, next) => {
      try {
        // First verify Firebase token (if not already done)
        if (!req.user) {
          return res.status(401).json({ message: "Authentication required" });
        }

        const userEmail = req.user.email;

        // Check user role in database
        const user = await usersCollection.findOne({ email: userEmail });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (user.role !== "student") {
          return res.status(403).json({
            message: "Access denied - Student privileges required",
          });
        }

        next();
      } catch (error) {
        console.error("Student verification error:", error);
        res.status(500).json({ message: "Internal server error" });
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
        const { email, role } = req.body;

        // ✅ Basic validation
        if (!email || !role) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        // verify user is registered on firebase or not
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

    // find user by email
    app.get("/api/user", verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.user?.email;

        // ✅ Validation
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });

        if (user) {
          return res.status(200).json({
            exists: true,
            role: user.role || "unknown",
          });
        }

        return res.status(200).json({
          exists: false,
        });
      } catch (error) {
        console.error("Failed to fetch user:", error.message);
        return res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET /api/userRole?email=user@example.com
    // app.get("/api/userRole", verifyFirebaseToken, async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     if (!email) {
    //       return res.status(400).json({ message: "Email is required" });
    //     }

    //     const user = await usersCollection.findOne({ email });
    //     if (!user) {
    //       return res.status(404).json({ message: "User not found" });
    //     }

    //     res.status(200).json({ role: user.role });
    //   } catch (error) {
    //     console.error("Failed to fetch role:", error.message);
    //     res.status(500).json({ message: "Internal server error" });
    //   }
    // });

    // Get all approved sessions
    app.get("/api/study-sessions/approved", async (req, res) => {
      try {
        const sessions = await sessionCollections
          .find({ status: "approved" })
          .toArray();
        if (!sessions) {
          return res.status(404).send({ message: "No sessions found" });
        }
        res.status(200).send(sessions);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // POST reviews
    app.post(
      "/api/reviews",
      verifyFirebaseToken,
      verifyStudent,
      async (req, res) => {
        try {
          const { sessionId, rating, comment, userName } = req.body;
          const userEmail = req.user.email;

          // Validate input
          if (!ObjectId.isValid(sessionId)) {
            return res
              .status(400)
              .json({ message: "Invalid session ID format" });
          }

          if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
            return res
              .status(400)
              .json({ message: "Rating must be between 1-5" });
          }

          // Check if session exists
          const session = await sessionCollections.findOne({
            _id: new ObjectId(sessionId),
            status: "approved", // Only allow reviews for approved sessions
          });

          if (!session) {
            return res
              .status(404)
              .json({ message: "Session not found or not approved" });
          }

          // Check if user already reviewed this session
          const existingReview = await reviewsCollection.findOne({
            sessionId,
            studentEmail: userEmail,
          });

          if (existingReview) {
            return res
              .status(400)
              .json({ message: "You've already reviewed this session" });
          }

          // Create new review
          const newReview = {
            sessionId,
            studentEmail: userEmail,
            studentName: userName || userEmail.split("@")[0], // Fallback to email prefix if no name
            rating: parseInt(rating),
            comment: comment || "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Insert review
          const result = await reviewsCollection.insertOne(newReview);

          // Update session's average rating (optional enhancement)
          await updateSessionAverageRating(sessionId);

          res.status(201).json({
            message: "Review submitted successfully",
            reviewId: result.insertedId,
          });
        } catch (error) {
          console.error("Review submission error:", error);
          res.status(500).json({ message: "Failed to submit review" });
        }
      }
    );

    // Helper function to update session's average rating
    // async function updateSessionAverageRating(sessionId) {
    //   try {
    //     const reviews = await db
    //       .collection("reviews")
    //       .find({ sessionId })
    //       .toArray();

    //     if (reviews.length > 0) {
    //       const totalRating = reviews.reduce(
    //         (sum, review) => sum + review.rating,
    //         0
    //       );
    //       const averageRating = totalRating / reviews.length;

    //       await sessionCollections.updateOne(
    //         { _id: new ObjectId(sessionId) },
    //         {
    //           $set: {
    //             averageRating: parseFloat(averageRating.toFixed(1)),
    //             reviewCount: reviews.length,
    //           },
    //         }
    //       );
    //     }
    //   } catch (error) {
    //     console.error("Failed to update session rating:", error);
    //   }
    // }

    // session details
    app.get("/api/sessions/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { studentEmail } = req.query;

        // Convert to ObjectId
        const session = await sessionCollections.findOne({
          _id: new ObjectId(sessionId),
        });

        if (!session) {
          return res.status(404).json({ message: "Session not found" });
        }

        let isBooked = false;

        if (studentEmail) {
          const booking = await bookedSessionsCollection.findOne({
            sessionId: new ObjectId(sessionId),
            studentEmail,
          });
          isBooked = !!booking;
        }

        res.status(200).json({ ...session, isBooked });
      } catch (error) {
        console.error("Error getting session:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET reviews by sessionId
    app.get("/api/reviews/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;

        // Validate sessionId format
        if (!ObjectId.isValid(sessionId)) {
          return res.status(400).json({ message: "Invalid session ID format" });
        }

        // Check if session exists (optional but recommended)
        const sessionExists = await sessionCollections.findOne({
          _id: new ObjectId(sessionId),
        });

        if (!sessionExists) {
          return res.status(404).json({ message: "Session not found" });
        }

        // Get all reviews for this session
        const reviews = await db
          .collection("reviews")
          .find({ sessionId })
          .sort({ createdAt: -1 }) // Newest first
          .toArray();

        res.status(200).json(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ message: "Failed to fetch reviews" });
      }
    });

    // create booking
    app.post(
      "/api/booking",
      verifyFirebaseToken,
      verifyStudent,
      async (req, res) => {
        try {
          const {
            sessionId,
            studentEmail,
            studentName,
            tutorEmail,
            tutorName,
            bookingDate,
            paymentStatus,
            status,
            sessionTitle,
            sessionDate,
          } = req.body;

          if (!sessionId || !studentEmail || !tutorEmail) {
            return res.status(400).json({ message: "Required fields missing" });
          }

          const bookingData = {
            sessionId: new ObjectId(sessionId),
            studentEmail,
            studentName,
            tutorEmail,
            tutorName,
            bookingDate: new Date(bookingDate),
            paymentStatus,
            status,
            sessionTitle,
            sessionDate: new Date(sessionDate),
          };

          const result = await bookedSessionsCollection.insertOne(bookingData);

          if (!result) {
            res.status(401).send({ message: "Booking not created" });
          }
          res.status(201).json({
            message: "Booking created successfully",
            insertedId: result.insertedId,
          });
        } catch (error) {
          res.status(500).json({ message: "Error checking booking" });
        }
      }
    );

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
