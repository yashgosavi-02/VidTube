import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// configuring cors
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// limiting JSON
app.use(
  express.json({
    limit: "16kb",
  })
);

// URL data configure
app.use(
  express.urlencoded({
    extended: true,
    limit: "16kb",
  })
);

// public assets
app.use(express.static("public"));

// cookie-parser configure
app.use(cookieParser());

// routes import
import userRouter from "./routes/user.routes.js";

// routes declarations
app.use("/api/v1/users", userRouter);




export { app };
