const express = require("express");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3001;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");

// middlewares
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

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
    const sessionMaterialsCollection = db.collection("session-materials");
    const studentNotesCollection = db.collection("student-notes");

    // jwt generate
    app.post("/api/generate-jwt", (req, res) => {
      try {
        const user = { email: req.body.email };
        // console.log(email);
        const token = jwt.sign(user, process.env.JWT_SECRET, {
          expiresIn: "1d",
        });
        if (!token) {
          return res.status(401).json({
            error: "Token not generated",
          });
        }
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // true on Vercel
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          })
          .send({ message: "JWT generated successfully" });
      } catch (error) {
        console.error("JWT generation failed:", error.message);
        res.status(500).send({ error: "JWT creation failed" });
      }
    });

    // jwt middleware
    const verifyJWT = async (req, res, next) => {
      try {
        const token = req?.cookies?.token;
        if (!token) {
          return res.status(401).json({
            message: "Unauthorized access!",
          });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // const userEmail = req?.query?.email;
        // if (userEmail !== decoded.email) {
        //   return res.status(403).json({
        //     message: "Unauthorized access",
        //   });
        // }
        req.user = decoded;
        next();
      } catch (error) {
        console.log(error);
        return res.status(500).json({
          message: "Something went wrong!",
        });
      }
    };

    // clear cookie
    app.get("/api/clear-cookie", (req, res) => {
      try {
        res
          .clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          })
          .send({ message: "Cookie cleared successfully" });
      } catch (error) {
        console.error("Clear Cookie Error:", error.message);
        res
          .status(500)
          .send({ error: "Something happened while Clear cookie" });
      }
    });

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

    // verify tutor
    const verifyTutor = async (req, res, next) => {
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

        if (user.role !== "tutor") {
          return res.status(403).json({
            message: "Access denied - Tutor privileges required",
          });
        }

        next();
      } catch (error) {
        console.error("Student verification error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    };

    // verify tutor
    const verifyAdmin = async (req, res, next) => {
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

        if (user.role !== "admin") {
          return res.status(403).json({
            message: "Access denied - Tutor privileges required",
          });
        }

        next();
      } catch (error) {
        console.error("Student verification error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    };

    // create user
    app.post("/api/registerUser", verifyJWT, async (req, res) => {
      try {
        const { email, role, name, photoURL } = req.body;

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
          name,
          email,
          role,
          photoURL,
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

    // find user role by email
    app.get("/api/user", verifyJWT, async (req, res) => {
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

    // all tutors
    app.get("/api/users/tutors", async (req, res) => {
      try {
        const tutors = await usersCollection.find({ role: "tutor" }).toArray();

        if (!tutors) {
          return res.status(401).send({ message: "Tutor not found" });
        }

        return res.status(200).send(tutors);
      } catch (error) {
        console.error("Failed to fetch user:", error.message);
        return res.status(500).json({ message: "Internal server error" });
      }
    });

    // POST: create-session
    app.post(
      "/api/create-session",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          // Validate required fields
          const requiredFields = [
            "title",
            "tutorName",
            "tutorEmail",
            "description",
            "registrationStart",
            "registrationEnd",
            "classStart",
            "classEnd",
            "duration",
            "maxStudents",
          ];

          for (const field of requiredFields) {
            if (!req.body[field]) {
              return res.status(400).json({ error: `${field} is required` });
            }
          }

          // Validate dates
          const registrationStart = new Date(req.body.registrationStart);
          const registrationEnd = new Date(req.body.registrationEnd);
          const classStart = new Date(req.body.classStart);
          const classEnd = new Date(req.body.classEnd);

          if (registrationStart >= registrationEnd) {
            return res.status(400).json({
              error: "Registration end must be after registration start",
            });
          }

          if (classStart >= classEnd) {
            return res
              .status(400)
              .json({ error: "Class end must be after class start" });
          }

          if (classStart <= registrationEnd) {
            return res
              .status(400)
              .json({ error: "Class must start after registration ends" });
          }

          // Prepare session data
          const sessionData = {
            ...req.body,
            registrationStart,
            registrationEnd,
            classStart,
            classEnd,
            currentStudents: 0,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Insert into database
          const result = await sessionCollections.insertOne(sessionData);

          if (result.insertedId) {
            return res.status(201).send(result);
          }

          res.status(400).send({ message: "Something went wrong" });
        } catch (error) {
          console.error("Error creating session:", error);
          res.status(500).json({ error: "Failed to create session" });
        }
      }
    );

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
    app.post("/api/reviews", verifyJWT, verifyStudent, async (req, res) => {
      try {
        const { sessionId, studentName, rating, comment } = req.body;
        const userEmail = req.user.email;

        // Validate input
        if (!ObjectId.isValid(sessionId)) {
          return res.status(400).json({ message: "Invalid session ID format" });
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
          studentName: studentName || userEmail.split("@")[0], // Fallback to email prefix if no name
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
    });

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

    // GET session by tutor email
    app.get("/api/my-sessions", verifyJWT, verifyTutor, async (req, res) => {
      const { tutorEmail } = req.query;
      try {
        const sessions = await sessionCollections
          .find({ tutorEmail })
          .toArray();
        res.json(sessions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // update session by tutor
    app.patch(
      "/api/sessions/:id/tutor",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          const sessionId = req.params.id;
          const {
            title,
            description,
            maxStudents,
            registrationStart,
            registrationEnd,
            classStart,
            classEnd,
            registrationFee,
          } = req.body;

          if (!title || !description) {
            return res
              .status(400)
              .json({ message: "Title and description are required." });
          }

          const updateResult = await sessionCollections.updateOne(
            { _id: new ObjectId(sessionId) },
            {
              $set: {
                title,
                description,
                maxStudents,
                registrationStart,
                registrationEnd,
                classStart,
                classEnd,
                registrationFee: parseInt(registrationFee) || 0,
                updatedAt: new Date().toISOString(),
              },
            }
          );

          if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: "Session not found." });
          }

          res.json({ message: "Session updated successfully." });
        } catch (error) {
          console.error("Update session error:", error);
          res
            .status(500)
            .json({ message: "Internal server error", error: error.message });
        }
      }
    );

    // update rejected session status
    app.patch(
      "/api/sessions/resubmit/:sessionId",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          const { sessionId } = req.params;

          if (!sessionId) {
            return res.status(400).send({ message: "Session ID is required" });
          }

          const result = await sessionCollections.updateOne(
            { _id: new ObjectId(sessionId) },
            { $set: { status: "pending" } }
          );

          if (result.modifiedCount === 0) {
            return res
              .status(400)
              .send({ message: "No session updated. It may not exist." });
          }

          res
            .status(200)
            .send({ message: "Session resubmitted for approval." });
        } catch (error) {
          console.error("Error updating session status:", error);
          res.status(500).json({
            message: "Internal server error. Please try again later.",
          });
        }
      }
    );

    // Get approved sessions for a tutor
    app.get(
      "/api/study-sessions/approved/tutor",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          const tutorEmail = req.query.tutorEmail;
          const sessions = await sessionCollections
            .find({ tutorEmail: tutorEmail, status: "approved" })
            .toArray();
          if (!sessions) {
            return res.status(404).send({ message: "No sessions found" });
          }
          res.status(200).send(sessions);
        } catch (error) {
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // POST: upload tutor materials by sessionId
    app.post(
      "/api/tutor-materials",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          const {
            title,
            sessionTitle,
            sessionId,
            tutorEmail,
            imageUrl,
            driveLink,
          } = req.body;

          // Validate required fields
          if (!title || !sessionId || !sessionTitle || !tutorEmail) {
            return res.status(400).send({ message: "Missing required fields" });
          }

          const materials = {
            title,
            sessionId,
            sessionTitle,
            tutorEmail,
            imageUrl: imageUrl || "",
            driveLink: driveLink || "",
            createdAt: new Date(),
          };

          const result = await sessionMaterialsCollection.insertOne(materials);

          if (result.insertedId) {
            return res.status(201).json({
              message: "Study material uploaded successfully",
              materialId: result.insertedId,
            });
          } else {
            return res
              .status(500)
              .json({ message: "Failed to upload material" });
          }
        } catch (error) {
          console.error("Upload error:", error);
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // GET: all materials create by a tutor
    app.get(
      "/api/tutor-materials",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        try {
          const materials = await sessionMaterialsCollection
            .find({ tutorEmail: req.user.email })
            .toArray();
          res.status(200).json(materials);
        } catch (error) {
          res.status(500).json({ message: "Failed to fetch materials" });
        }
      }
    );

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
    app.post("/api/booking", verifyJWT, verifyStudent, async (req, res) => {
      try {
        const {
          sessionId,
          studentEmail,
          studentName,
          tutorEmail,
          tutorName,
          registrationFee,
          sessionTitle,
          classStart,
          classEnd,
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
          bookingDate: new Date().toISOString(),
          registrationFee,
          sessionTitle,
          classStart: new Date(classStart),
          classEnd: new Date(classEnd),
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
    });

    // GET booked sessions by student
    app.get(
      "/api/booked-sessions",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const { studentEmail } = req.query;

          if (!studentEmail) {
            return res
              .status(400)
              .json({ message: "Student email is required" });
          }

          const query = { studentEmail };

          const sessions = await bookedSessionsCollection
            .find(query)
            .sort({ sessionDate: 1 }) // Optional: Sort by session date ascending
            .toArray();

          res.status(200).json(sessions);
        } catch (error) {
          console.error("Error fetching booked sessions:", error);
          res.status(500).json({ message: "Failed to fetch booked sessions" });
        }
      }
    );

    // POST student notes
    app.post(
      "/api/student-notes",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const { email, title, description } = req.body;

          // Validate input
          if (!email || !title || !description) {
            return res.status(400).send({
              message: "Email, title, and description are required.",
            });
          }

          const note = {
            email,
            title,
            description,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await studentNotesCollection.insertOne(note);

          if (!result.insertedId) {
            return res.status(500).send({
              message: "Failed to save note. Please try again.",
            });
          }

          res.status(201).send({
            message: "Note saved successfully",
            noteId: result.insertedId,
          });
        } catch (error) {
          console.error("Error saving student note:", error);
          res
            .status(500)
            .json({ message: "Failed to save student note. Server error." });
        }
      }
    );

    // Get student's notes
    app.get(
      "/api/student-notes",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const { email } = req.query;

          if (!email) {
            return res
              .status(400)
              .json({ message: "Email query parameter is required." });
          }

          const notes = await studentNotesCollection
            .find({ email })
            .sort({ createdAt: -1 })
            .toArray();

          res.status(200).json(notes);
        } catch (error) {
          console.error("Error fetching student notes:", error);
          res.status(500).json({ message: "Failed to fetch notes" });
        }
      }
    );

    // update student's note
    app.patch(
      "/api/student-notes/:id",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { title, description } = req.body;

          if (!title || !description) {
            return res
              .status(400)
              .json({ message: "Title and description are required." });
          }

          const updatedNote = await studentNotesCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            {
              $set: {
                title,
                description,
                updatedAt: new Date(),
              },
            }
          );

          if (!updatedNote) {
            return res.status(404).json({ message: "Note not found." });
          }

          res.status(200).json(updatedNote.value);
        } catch (error) {
          console.error("Error updating note:", error);
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // delete student's note
    app.delete(
      "/api/student-notes/:id",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const { id } = req.params;

          const result = await studentNotesCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Note not found" });
          }

          res.status(200).json({ message: "Note deleted successfully" });
        } catch (error) {
          console.error("Error deleting note:", error);
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // GET materials by id
    app.get("/api/materials", verifyJWT, verifyStudent, async (req, res) => {
      try {
        const { sessionId } = req.query;

        if (!sessionId || !ObjectId.isValid(sessionId)) {
          return res
            .status(400)
            .json({ message: "A valid sessionId is required." });
        }

        const materials = await sessionMaterialsCollection
          .find({ sessionId })
          .sort({ createdAt: -1 }) // optional: show latest materials first
          .toArray();

        res.status(200).json(materials);
      } catch (error) {
        console.error("Error fetching materials:", error);
        res.status(500).json({ message: "Failed to fetch materials" });
      }
    });

    // // Get all users with search
    app.get("/api/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { search } = req.query;
        let query = {};

        if (search) {
          query = {
            $or: [
              // { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
            ],
          };
        }

        const users = await usersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update user role
    app.patch(
      "/api/users/:userId/role",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { userId } = req.params;
          const { role } = req.body;

          if (!["admin", "tutor", "student"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
          }

          const updatedUser = await usersCollection.findOneAndUpdate(
            { _id: new ObjectId(userId) },
            {
              $set: { role },
            }
          );

          if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
          }

          res.json(updatedUser);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get all sessions
    app.get("/api/sessions", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const sessions = await sessionCollections
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(sessions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Approve session
    app.patch(
      "/api/sessions/:sessionId/approve",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { sessionId } = req.params;
          const { registrationFee } = req.body;

          const updatedSession = await sessionCollections.findOneAndUpdate(
            { _id: new ObjectId(sessionId) },
            {
              $set: {
                status: "approved",
                registrationFee,
                approvedAt: new Date(),
              },
            }
          );

          if (!updatedSession) {
            return res.status(404).json({ error: "Session not found" });
          }

          res.json(updatedSession);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Reject session
    app.patch(
      "/api/sessions/:id/reject",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        console.log(req.body, req.params.id);
        const { id } = req.params;
        const { rejectionReason, rejectionFeedback } = req.body;

        if (!rejectionReason || !rejectionFeedback) {
          return res
            .status(400)
            .json({ error: "Reason and feedback are required." });
        }

        try {
          const result = await sessionCollections.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "rejected",
                rejectionReason,
                rejectionFeedback,
                rejectedAt: new Date(),
                rejectedBy: req.user.email, // if available from Firebase token
              },
            }
          );

          if (result.modifiedCount === 0) {
            return res
              .status(404)
              .json({ error: "Session not found or already updated." });
          }

          res.json({ message: "Session rejected successfully." });
        } catch (error) {
          console.error("Reject session error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // update session
    app.patch("/api/sessions/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const sessionId = req.params.id;
        const {
          title,
          description,
          maxStudents,
          registrationStart,
          registrationEnd,
          classStart,
          classEnd,
          registrationFee,
        } = req.body;

        if (!title || !description) {
          return res
            .status(400)
            .json({ message: "Title and description are required." });
        }

        const updateResult = await sessionCollections.updateOne(
          { _id: new ObjectId(sessionId) },
          {
            $set: {
              title,
              description,
              maxStudents,
              registrationStart,
              registrationEnd,
              classStart,
              classEnd,
              registrationFee: parseInt(registrationFee) || 0,
              updatedAt: new Date().toISOString(),
            },
          }
        );

        if (updateResult.matchedCount === 0) {
          return res.status(404).json({ message: "Session not found." });
        }

        res.json({ message: "Session updated successfully." });
      } catch (error) {
        console.error("Update session error:", error);
        res
          .status(500)
          .json({ message: "Internal server error", error: error.message });
      }
    });

    // Delete session
    app.delete(
      "/api/sessions/:sessionId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { sessionId } = req.params;
          if (!sessionId) {
            return res.status(400).send({ message: "SessionId not found" });
          }
          const result = await sessionCollections.deleteOne({
            _id: new ObjectId(sessionId),
          });
          if (!result) {
            return res
              .status(400)
              .send({ message: "Not updated successfully" });
          }
          res.json({ message: "Session deleted successfully" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Get all materials with pagination
    app.get("/api/materials/all", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const materials = await sessionMaterialsCollection
          .find()
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        const total = await sessionMaterialsCollection.countDocuments();

        res.json({ total, materials });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete material
    app.delete(
      "/api/materials/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid material ID" });
          }

          const result = await sessionMaterialsCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Material not found" });
          }

          res.json({ message: "Material deleted successfully" });
        } catch (error) {
          console.error("Delete error:", error);
          res
            .status(500)
            .json({ error: "Server error. Please try again later." });
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
