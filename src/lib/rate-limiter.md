# Rate Limiter Middleware

This module provides a flexible rate limiting solution for Next.js API routes using `rate-limiter-flexible` with Redis store for production and memory store for development.

## Features

- **Multiple Store Backends**: Uses Redis in production (when REDIS_URL is configured) and falls back to in-memory store in development
- **Configurable Limits**: Different rate limits for different route types (auth, general, AI-intensive, webhooks, payment)
- **Easy Integration**: Higher-order function wrapper (`withRateLimit`) for easy application to API route handlers
- **Standard Response**: Returns 429 status with Retry-After header when limit is exceeded
- **Identifier Flexibility**: Customizable client identification (defaults to IP address)

## Installation

The `rate-limiter-flexible` package is already installed in this project.

## Usage

### Basic Usage

```typescript
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // Your API logic here
  return NextResponse.json({ message: 'Success' })
}

// Apply general rate limiting (100 requests per minute)
export const POST = withRateLimit(handler)
```

### With Specific Route Type

```typescript
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // Your API logic here
  return NextResponse.json({ message: 'Success' })
}

// Apply AI-specific rate limiting (20 requests per minute)
export const POST = withRateLimit(handler, 'ai')
```

### With Custom Identifier Function

```typescript
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // Your API logic here
  return NextResponse.json({ message: 'Success' })
}

// Rate limit by user ID instead of IP
export const POST = withRateLimit(
  handler,
  'general',
  (req) => {
    // Extract user ID from request (e.g., from auth token)
    const userId = req.headers.get('x-user-id')
    return userId || 'anonymous'
  }
)
```

## Route Types Configuration

The middleware includes predefined configurations for different route types:

| Route Type | Requests | Duration | Block Duration | Use Case |
|------------|----------|----------|----------------|----------|
| `auth` | 5 | 60 seconds | 300 seconds | Authentication endpoints (login, register) |
| `general` | 100 | 60 seconds | 60 seconds | General API endpoints |
| `ai` | 20 | 60 seconds | 300 seconds | AI-intensive endpoints (OpenAI, Anthropic, etc.) |
| `webhook` | 200 | 60 seconds | 60 seconds | Webhook endpoints (Stripe, Razorpay, etc.) |
| `payment` | 10 | 60 seconds | 300 seconds | Payment processing endpoints |

## How It Works

1. **Environment Detection**: Automatically detects if Redis is available via `REDIS_URL` environment variable
2. **Store Selection**: Uses Redis store in production when available, otherwise falls back to memory store
3. **Rate Limiting**: Applies the configured limits based on route type and client identifier
4. **Response Handling**: When limit is exceeded, returns a 429 status with appropriate headers:
   - `Retry-After`: Seconds until the client can make another request
   - Standard JSON error response

## Implementation Notes

- The rate limiter uses a key format of `rate-limit:{identifier}` in Redis
- In development/testing environments, the memory store is used which resets when the server restarts
- For production deployments with multiple instances, Redis is required for shared rate limiting across instances
- The middleware is designed to work with Next.js App Router route handlers (`route.ts` files)

## Customization

To modify the rate limiting configurations, edit the `rateLimiterConfig` object in `src/lib/rate-limiter.ts`:

```typescript
export const rateLimiterConfig = {
  auth: {
    points: 5,      // Number of requests
    duration: 60,   // Per seconds
    blockDuration: 300, // Block duration in seconds (0 to disable blocking)
  },
  // ... other configurations
}
```

## Error Handling

When rate limit is exceeded, the middleware throws an error that is caught by the `withRateLimit` wrapper, which returns:

```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 45
}
```

With HTTP status 429 and headers:
- `Retry-After: 45`
- `Content-Type: application/json`