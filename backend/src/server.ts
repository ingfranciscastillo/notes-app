import Fastify from "fastify";
import fastifyJWT from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifySensible from "@fastify/sensible";
import { authRoutes } from "./routes/auth";
import { notesRoutes } from "./routes/notes";
import { syncRoutes } from "./routes/sync";

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "your-refresh-secret-key-change-in-production";

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Disable for development
});

await fastify.register(fastifyCors, {
  origin: process.env.FRONTEND_URL || "http://localhost:4321",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await fastify.register(fastifyCookie);

await fastify.register(fastifyJWT, {
  secret: JWT_SECRET,
});

await fastify.register(fastifySensible);

fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

await fastify.register(authRoutes, { prefix: "/auth" });

await fastify.register(notesRoutes, { prefix: "/notes" });

await fastify.register(syncRoutes, { prefix: "/sync" });

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.name === "UnauthorizedError") {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }

  if (error.validation) {
    return reply.code(400).send({
      error: "Validation Error",
      message: error.message,
      details: error.validation,
    });
  }

  return reply.code(error.statusCode || 500).send({
    error: error.name || "Internal Server Error",
    message: error.message || "Something went wrong",
  });
});

async function start() {
  try {
    await fastify.listen({
      port: PORT,
      host: HOST,
    });

    fastify.log.info(`Server running at http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

const signals = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, closing server...`);
    await fastify.close();
    process.exit(0);
  });
});

start();
