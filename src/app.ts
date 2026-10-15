import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import morgan from "morgan";
import { z } from "zod";
import contentRoutes from "./routes/content.routes.js";
import adminContentRoutes from "./routes/admin-content.routes.js";
import authRoutes, { bootstrapRouter } from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import savedContentRoutes from "./routes/saved-content.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import { config, HttpError } from "./config.js";

const app = express();
const allowedOrigins = new Set([config.FRONTEND_URL]);
const changedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.disable("x-powered-by");
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) callback(null, true);
    else callback(new HttpError(403, "This website is not allowed to call the API.", "ORIGIN_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "1mb" }));
app.use((request, _response, next) => {
  if (changedMethods.has(request.method)) {
    const origin = request.get("origin");
    const hasSession = request.headers.cookie?.includes("careergrill_session=");
    if (origin && !allowedOrigins.has(origin)) {
      next(new HttpError(403, "This website is not allowed to call the API.", "ORIGIN_NOT_ALLOWED"));
      return;
    }
    if (hasSession && !origin) {
      next(new HttpError(403, "An origin is required for session-based requests.", "ORIGIN_REQUIRED"));
      return;
    }
  }
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "careergrill-api" });
});
app.use("/api/content", contentRoutes);
app.use("/api/admin/content", adminContentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin/bootstrap", bootstrapRouter);
app.use("/api/saved", savedContentRoutes);
app.use("/api/audits", auditRoutes);
app.use("/api/admin", adminRoutes);

app.use((_request, _response, next) => next(new HttpError(404, "This API route was not found.", "ROUTE_NOT_FOUND")));

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "Files must be 10 MB or smaller." : "The upload could not be processed.",
      code: error.code,
    });
    return;
  }
  if (error instanceof z.ZodError) {
    response.status(422).json({
      error: "Check the submitted fields and try again.",
      code: "VALIDATION_FAILED",
      details: error.issues.map(({ code, path, message }) => ({ code, path, message })),
    });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error("Unhandled API error:", error);
  response.status(500).json({ error: "The request could not be completed.", code: "INTERNAL_ERROR" });
};
app.use(errorHandler);

export default app;
