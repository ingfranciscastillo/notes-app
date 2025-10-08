import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  createJWTPayload,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  REFRESH_COOKIE_OPTIONS,
} from "../utils/jwt";
import type { AuthResponse } from "../types";

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/register
   * Register a new user
   */
  fastify.post<{ Body: z.infer<typeof registerSchema> }>(
    "/register",
    async (request, reply) => {
      try {
        const { email, password } = registerSchema.parse(request.body);

        // Check if user already exists
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          return reply.code(409).send({
            error: "Conflict",
            message: "User already exists",
          });
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);
        const [user] = await db
          .insert(users)
          .values({
            email,
            passwordHash,
          })
          .returning();

        // Create JWT tokens
        const payload = createJWTPayload(user.id, user.email);
        const accessToken = fastify.jwt.sign(payload, {
          expiresIn: ACCESS_TOKEN_EXPIRY,
        });
        const refreshToken = fastify.jwt.sign(payload, {
          expiresIn: REFRESH_TOKEN_EXPIRY,
        });

        // Set refresh token as HttpOnly cookie
        reply.setCookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

        const response: AuthResponse = {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
          },
        };

        return reply.code(201).send(response);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.issues,
          });
        }
        throw error;
      }
    }
  );

  /**
   * POST /auth/login
   * Login existing user
   */
  fastify.post<{ Body: z.infer<typeof loginSchema> }>(
    "/login",
    async (request, reply) => {
      try {
        const { email, password } = loginSchema.parse(request.body);

        // Find user
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid credentials",
          });
        }

        // Verify password
        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid credentials",
          });
        }

        // Create JWT tokens
        const payload = createJWTPayload(user.id, user.email);
        const accessToken = fastify.jwt.sign(payload, {
          expiresIn: ACCESS_TOKEN_EXPIRY,
        });
        const refreshToken = fastify.jwt.sign(payload, {
          expiresIn: REFRESH_TOKEN_EXPIRY,
        });

        // Set refresh token as HttpOnly cookie
        reply.setCookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

        const response: AuthResponse = {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
          },
        };

        return reply.send(response);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.issues,
          });
        }
        throw error;
      }
    }
  );

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token from cookie
   */
  fastify.post("/refresh", async (request, reply) => {
    try {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "No refresh token provided",
        });
      }

      // Verify refresh token
      const payload = fastify.jwt.verify<{ userId: string; email: string }>(
        refreshToken,
      );

      // Create new access token
      const newAccessToken = fastify.jwt.sign(
        createJWTPayload(payload.userId, payload.email),
        {
          expiresIn: ACCESS_TOKEN_EXPIRY,
        }
      );

      return reply.send({ accessToken: newAccessToken });
    } catch (error) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid or expired refresh token",
      });
    }
  });

  /**
   * POST /auth/logout
   * Logout user by clearing refresh token cookie
   */
  fastify.post("/logout", async (request, reply) => {
    reply.clearCookie("refreshToken", {
      path: "/",
    });

    return reply.send({ message: "Logged out successfully" });
  });
}

