import { RateLimiterRedis } from 'rate-limiter-flexible';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { NextRequest } from 'next/server';

// Rate limiter configuration for different route types
export const rateLimiterConfig = {
  // Authentication routes: stricter limits to prevent brute force
  auth: {
    points: 5, // 5 attempts
    duration: 60, // per minute
    blockDuration: 300, // Block for 5 minutes after exceeding limit
  },

  // General API routes: moderate limits
  general: {
    points: 100, // 100 requests
    duration: 60, // per minute
    blockDuration: 60, // Block for 1 minute after exceeding limit
  },

  // AI-intensive routes: stricter limits due to cost
  ai: {
    points: 20, // 20 requests
    duration: 60, // per minute
    blockDuration: 300, // Block for 5 minutes after exceeding limit
  },

  // Webhook routes: higher limits as they're automated
  webhook: {
    points: 200, // 200 requests
    duration: 60, // per minute
    blockDuration: 60, // Block for 1 minute after exceeding limit
  },

  // Payment routes: moderate limits to prevent abuse
  payment: {
    points: 10, // 10 requests
    duration: 60, // per minute
    blockDuration: 300, // Block for 5 minutes after exceeding point
  },
};

// Initialize rate limiter stores based on environment
let redisClient: any = null;

// Initialize Redis client if REDIS_URL is available (done asynchronously to avoid top-level await)
async function initializeRedis() {
  if (process.env.REDIS_URL) {
    try {
      const Redis = (await import('ioredis')).default;
      redisClient = new Redis(process.env.REDIS_URL);
      console.log('[Rate Limiter] Redis store initialized');
    } catch (error) {
      console.warn('[Rate Limiter] Failed to initialize Redis, falling back to memory store:', error);
      redisClient = null;
    }
  }
}

// Initialize Redis immediately (but handle promise properly)
initializeRedis().catch(console.error);

/**
 * Get rate limiter instance for a specific key and configuration
 */
export function getRateLimiter(
  key: string,
  config: { points: number; duration: number; blockDuration?: number }
) {
  // Use Redis store in production if available, otherwise use memory store
  if (redisClient && process.env.NODE_ENV === 'production') {
    return new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rate-limit',
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration || 0,
    });
  } else {
    return new RateLimiterMemory({
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration || 0,
    });
  }
}

/**
 * Rate limiter middleware for Next.js API routes
 *
 * @param routeType - Type of route ('auth', 'general', 'ai', 'webhook', 'payment')
 * @param identifierFn - Function to extract identifier from request (defaults to IP)
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  routeType: keyof typeof rateLimiterConfig = 'general',
  identifierFn: (req: NextRequest) => string = getClientIdentifier
) {
  const config = rateLimiterConfig[routeType];
  if (!config) {
    throw new Error(`Invalid route type: ${routeType}`);
  }

  const identifier = identifierFn(request);
  if (!identifier) {
    // If we can't identify the client, allow the request to proceed
    return;
  }

  const rateLimiter = getRateLimiter(identifier, config);

  try {
    await rateLimiter.consume(identifier);
    // Request is allowed, continue
  } catch (err) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((err as any).msBeforeNext / 1000) || 1;

    // Throw an error that can be caught in the API route
    const error: any = new Error('Rate limit exceeded');
    error.status = 429;
    error.retryAfter = retryAfter;
    error.limitInfo = {
      limit: config.points,
      window: config.duration,
      current: (err as any).consumedPoints,
      remaining: 0,
      resetTime: new Date(Date.now() + retryAfter * 1000),
    };

    throw error;
  }
}

/**
 * Get client identifier from request (IP address)
 */
export function getClientIdentifier(request: NextRequest): string {
  // Check for forwarded headers first (for reverse proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the forwarded-for header
    return forwardedFor.split(',')[0].trim();
  }

  // Check for real-ip header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Some hosting adapters add an IP field even though NextRequest does not type it.
  const requestIp: unknown = Reflect.get(request, 'ip')
  if (typeof requestIp === 'string' && requestIp) {
    return requestIp
  }

// Fallback to anonymous if no identifier can be determined
  return 'anonymous';
}

/**
 * Wrapper function to apply rate limiting to API route handlers
 *
 * @param handler - The API route handler function
 * @param routeType - Type of route for rate limiting configuration
 * @param identifierFn - Optional function to extract identifier from request
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<any>,
  routeType: keyof typeof rateLimiterConfig = 'general',
  identifierFn: (req: NextRequest) => string = getClientIdentifier
) {
  return async function rateLimitedHandler(request: NextRequest) {
    try {
      await rateLimitMiddleware(request, routeType, identifierFn);
      return await handler(request);
    } catch (error: any) {
      if (error.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Too many requests, please try again later.',
            retryAfter: error.retryAfter
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(error.retryAfter),
            },
          }
        );
      }
      throw error;
    }
  };
}