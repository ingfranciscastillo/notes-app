import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '../types';

/**
 * Authentication middleware - validates JWT token
 * Attaches user data to request.user if valid
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT from Authorization header
    const payload = await request.jwtVerify<JWTPayload>();
    request.user = payload;
  } catch (err) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}