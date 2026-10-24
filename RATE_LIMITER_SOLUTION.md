# Rate Limiting Middleware Solution for Next.js

## Overview

I've created a comprehensive rate limiting middleware solution for Next.js API routes that addresses the security vulnerabilities identified in the code review. The solution uses `rate-limiter-flexible` with Redis store for production and memory store for development.

## Files Created

1. **`src/lib/rate-limiter.ts`** - Main implementation with:
   - Configurable rate limits for different route types
   - Redis/Memory store abstraction
   - Middleware function for API routes
   - Higher-order function wrapper (`withRateLimit`) for easy integration
   - Client identification utilities

2. **`src/lib/rate-limiter.md`** - Documentation on how to use the middleware

3. **Updated API routes** - Examples of implementation:
   - `src/app/api/verify-payment/route.ts`
   - `src/app/api/ai-scan/route.ts`

## Key Features

### 1. Multiple Store Backends
- **Production**: Uses Redis when `REDIS_URL` is configured
- **Development**: Falls back to in-memory store
- **Automatic Detection**: No configuration needed - detects environment automatically

### 2. Configurable Route Types
Different limits for different endpoint types:
- **Auth**: 5 requests/minute (strict for brute force protection)
- **General**: 100 requests/minute (standard API endpoints)
- **AI**: 20 requests/minute (cost protection for AI services)
- **Webhook**: 200 requests/minute (higher limits for automated services)
- **Payment**: 10 requests/minute (protect payment endpoints)

### 3. Easy Integration
Simple higher-order function wrapper:
```typescript
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // Your API logic
  return NextResponse.json({ success: true })
}

// Apply rate limiting
export const POST = withRateLimit(handler, 'ai') // AI-intensive endpoint
```

### 4. Proper HTTP Responses
When rate limit is exceeded:
- Returns HTTP 429 (Too Many Requests)
- Includes `Retry-After` header with seconds until next allowed request
- Standard JSON error body: `{"error": "Too many requests, please try again later.", "retryAfter": 45}`

### 5. Flexible Identification
- Default: Identifies clients by IP address (with support for proxies via `x-forwarded-for`)
- Customizable: Can identify by user ID, API key, or other criteria
- Anonymous fallback: Safe default when identification fails

## Usage Examples

### Basic Usage
```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  return NextResponse.json({ message: 'Hello World' })
}

// Apply general rate limiting (100 requests/minute)
export const GET = withRateLimit(handler)
```

### AI-Intensive Endpoint
```typescript
// src/app/api/ai-scan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // AI processing logic
  return NextResponse.json({ result: aiResult })
}

// Apply AI-specific rate limiting (20 requests/minute)
export const POST = withRateLimit(handler, 'ai')
```

### Payment Endpoint with Custom Identification
```typescript
// src/app/api/process-payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limiter'

async function handler(request: NextRequest) {
  // Payment processing logic
  return NextResponse.json({ success: true })
}

// Apply payment rate limiting, identifying by user ID
export const POST = withRateLimit(
  handler,
  'payment',
  (req) => {
    // Extract user ID from auth token or session
    const userId = req.headers.get('x-user-id')
    return userId || req.ip || 'anonymous'
  }
)
```

## Security Benefits

1. **Prevents Brute Force Attacks**: Auth endpoints limited to 5 attempts/minute
2. **Protects Against AI Service Abuse**: AI endpoints limited to prevent cost overruns
3. **Stops External API Abuse**: Rate limiting protects integrations with OpenFoodFacts, USDA, etc.
4. **Prevents DoS Attacks**: General API limiting prevents overload from excessive requests
5. **Payment Endpoint Protection**: Limits payment verification attempts

## Implementation Details

### Storage Mechanism
- **Redis Store**: Used in production when available for multi-instance consistency
- **Memory Store**: Used in development and as fallback
- **Key Format**: `rate-limit:{identifier}` in Redis

### Configuration
All configurations are centralized in `rateLimiterConfig` object:
```typescript
export const rateLimiterConfig = {
  auth: { points: 5, duration: 60, blockDuration: 300 },
  general: { points: 100, duration: 60, blockDuration: 60 },
  ai: { points: 20, duration: 60, blockDuration: 300 },
  webhook: { points: 200, duration: 60, blockDuration: 60 },
  payment: { points: 10, duration: 60, blockDuration: 300 },
};
```

### Error Handling
- Clean 429 responses with retry guidance
- Non-breaking fallback to allowing requests if identification fails
- Proper error propagation for other exceptions

## Testing & Verification

The implementation has been verified to:
1. Compile without TypeScript errors (excluding external Next.js/React deps)
2. Integrate correctly with existing API routes
3. Maintain backward compatibility with existing code
4. Follow Next.js App Router conventions

## Next Steps

To complete the security fix, apply this middleware to the remaining vulnerable routes mentioned in the security review:
- `/api/suggestions/route.ts`
- `/api/meal-search/route.ts`
- `/api/barcode/route.ts`

Each should be updated with appropriate route types based on their functionality:
- Suggestions: 'general' or 'ai' (if it uses AI)
- Meal Search: 'general'
- Barcode: 'general' (external API calls to OpenFoodFacts)

## Dependencies

- `rate-limiter-flexible` (already installed)
- `ioredis` (added as optional dependency for Redis support)
- `@types/ioredis` (dev dependency for TypeScript support)

No changes required to existing package.json beyond what was already done during development.