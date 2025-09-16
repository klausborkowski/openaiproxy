# OpenAI Prompts Caching Proxy (Node.js)

A high-performance HTTP service that forwards OpenAI-style API requests to a configurable **proxy server** (or directly to `api.openai.com`) with intelligent caching, rate limiting, and comprehensive observability.

## Features

- **🚀 Rate Limiting** - Token bucket algorithm per client (API key hash or IP)
- **⚡ Response Caching** - In-memory TTL cache with LRU eviction
- **📊 Observability** - Health checks, metrics, structured logging
- **🔒 Security** - Admin endpoints with token authentication
- **🎯 Zero Dependencies** - Built on native Node.js with minimal external deps
- **📈 Production Ready** - Designed for clarity, maintainability, and performance

Requires Node.js 18+. No build step needed.

---

## Quick Start

```bash
git clone https://example.com/openai-proxy.git
cd openai-proxy
cp .env.example .env
# Configure your environment variables
npm install
npm run start
```

---

## API Documentation

### Core Proxy Endpoints

#### POST /v1/* 
Forwards OpenAI-compatible requests to the configured upstream server.

**Headers:**
- `Authorization` - Bearer token for OpenAI API (optional if `UPSTREAM_API_KEY` is set)
- `Content-Type` - `application/json` (recommended)
- `x-cache-invalidate` - Set to `true` to bypass cache for this request
- `x-admin-token` - Required for admin endpoints

**Response Headers:**
- `x-cache` - Cache status: `hit`, `miss`, `bypass`, `bypass-invalidate`
- `x-rate-remaining` - Number of remaining rate limit tokens

**Request/Response Models:**

```typescript
// Standard OpenAI Chat Completion Request
interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // ... other OpenAI parameters
}

// Standard OpenAI Response
interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Error Response
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}
```

### System Endpoints

#### GET /healthz
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime_s": 12345.67
}
```

#### GET /metrics
Prometheus-style metrics in plain text format.

**Response:**
```
total_requests 1234
cache_hits 567
cache_misses 234
cache_bypass 45
cache_stores 234
rate_limited 12
upstream_errors 3
in_flight 2
cache_size 150
cache_hits_internal 567
cache_misses_internal 234
cache_stores_internal 234
cache_evictions 23
rate_buckets 45
rate_limited_internal 12
```

#### POST /admin/cache/purge
Purge cache entries (requires admin authentication).

**Headers:**
- `x-admin-token` - Must match `ADMIN_TOKEN` environment variable

**Request Body:**
```json
{
  "key": "*"          // Purge all entries
}
```
or
```json
{
  "key": "specific-cache-key"  // Purge specific entry
}
```

**Response:**
```json
{
  "ok": true,
  "cleared": true,     // For wildcard purge
  "deleted": true      // For specific key purge
}
```

---

## Component Architecture

### 🗄️ Cache Component (`TTLCache`)

**Purpose:** In-memory caching with TTL (Time To Live) and LRU (Least Recently Used) eviction.

**Key Features:**
- **TTL Expiration:** Automatically expires entries after configurable time
- **LRU Eviction:** Removes least recently used items when max capacity reached
- **Doubly Linked List:** O(1) operations for get/set/evict
- **Thread-Safe:** Single-threaded Node.js environment safe

**Internal Structure:**
```javascript
// Cache Node Structure
{
  k: "cache-key",
  value: {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from("response data")
  },
  expiresAt: 1640995200000,
  prev: <node>,
  next: <node>
}
```

**Operations:**
- `get(key)` - Retrieve and move to front (O(1))
- `set(key, value, ttl?)` - Store and move to front (O(1))
- `del(key)` - Remove specific entry (O(1))
- `clear()` - Remove all entries (O(1))

**Cache Key Format:**
```
{METHOD}:{PATH}{QUERY}:{AUTH_HASH}:{BODY_HASH}
```

Example: `POST:/v1/chat/completions:auth:a1b2c3d4:e5f6g7h8`

**Configuration:**
- `CACHE_TTL_MS` - Time to live in milliseconds (default: 60000)
- `CACHE_MAX_ENTRIES` - Maximum cache entries (default: 500)
- `CACHE_ONLY_SUCCESS` - Only cache 2xx responses (default: true)

### ⚡ Rate Limiter Component (`RateLimiter`)

**Purpose:** Token bucket rate limiting per client to prevent API abuse.

**Algorithm:** Token Bucket
- Each client gets a bucket with configurable token capacity
- Tokens refill at a constant rate
- Requests consume tokens; rejected when bucket empty

**Client Identification:**
1. **API Key Hash** (preferred) - SHA256 hash of Authorization header
2. **IP Address** (fallback) - Client IP from headers or socket

**Token Bucket Structure:**
```javascript
{
  tokens: 45.7,        // Current available tokens (float)
  last: 1640995200000  // Last refill timestamp
}
```

**Operations:**
- `tryRemoveToken(clientId, n=1)` - Attempt to consume tokens
- Token refill calculation: `tokens += (elapsed_seconds * refillPerSec)`
- Maximum tokens capped at `maxTokens`

**Configuration:**
- `RATE_LIMIT_TOKENS` - Maximum tokens per bucket (default: 60)
- `RATE_LIMIT_REFILL_PER_SEC` - Tokens added per second (default: 1)

**Response Behavior:**
- **Success:** Returns `{ ok: true, remaining: N }`
- **Rate Limited:** Returns `{ ok: false, remaining: N }` with HTTP 429

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server listening port |
| `HOST` | 0.0.0.0 | Server bind address |
| `UPSTREAM_BASE_URL` | https://api.openai.com | Target API server |
| `UPSTREAM_API_KEY` | "" | API key for upstream (optional) |
| `UPSTREAM_AUTH_HEADER_NAME` | Authorization | Auth header name |
| `UPSTREAM_TIMEOUT_MS` | 60000 | Request timeout |
| `RATE_LIMIT_TOKENS` | 60 | Max tokens per client |
| `RATE_LIMIT_REFILL_PER_SEC` | 1 | Token refill rate |
| `CACHE_TTL_MS` | 60000 | Cache entry TTL |
| `CACHE_MAX_ENTRIES` | 500 | Max cache size |
| `CACHE_ONLY_SUCCESS` | true | Cache only 2xx responses |
| `ADMIN_TOKEN` | changeme | Admin API authentication |
| `LOG_LEVEL` | info | Logging level |
| `NODE_ENV` | production | Environment mode |

### Cache Behavior

**Cached Requests:**
- ✅ POST requests with JSON body
- ✅ Successful responses (2xx) when `CACHE_ONLY_SUCCESS=true`
- ✅ All responses when `CACHE_ONLY_SUCCESS=false`

**Bypassed Requests:**
- ❌ GET requests (typically not cached)
- ❌ Streaming requests (`stream: true` in body)
- ❌ Requests with `x-cache-invalidate: true` header
- ❌ Non-JSON requests

### Rate Limiting Behavior

**Per-Client Limits:**
- Each unique client (API key or IP) gets separate token bucket
- Tokens refill continuously at configured rate
- Burst capacity up to maximum tokens

**HTTP Status Codes:**
- `200` - Request allowed, tokens consumed
- `429` - Rate limited, includes `retry-after: 1` header

---

## Development

### Running Locally

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm run start
```

### Testing

```bash
# Health check
curl http://localhost:8080/healthz

# Metrics
curl http://localhost:8080/metrics

# Sample OpenAI request
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Cache purge (admin)
curl -X POST http://localhost:8080/admin/cache/purge \
  -H "x-admin-token: your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"key": "*"}'
```

### Monitoring

The service provides comprehensive metrics for monitoring:

- **Request Metrics:** Total requests, in-flight requests
- **Cache Metrics:** Hits, misses, stores, evictions, size
- **Rate Limit Metrics:** Rate limited requests, active buckets
- **Error Metrics:** Upstream errors, internal errors

Use with monitoring tools like Prometheus, Grafana, or custom dashboards.

---

## Production Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 8080
CMD ["npm", "start"]
```

### Performance Considerations

- **Memory Usage:** Cache size and TTL directly impact memory consumption
- **Rate Limiting:** Adjust token bucket parameters based on expected load
- **Upstream Timeouts:** Configure appropriate timeouts for your use case
- **Logging:** Adjust log level for production (`LOG_LEVEL=warn`)

### Security

- Change default `ADMIN_TOKEN` in production
- Use HTTPS in production deployments
- Consider API key rotation policies
- Monitor rate limiting effectiveness
