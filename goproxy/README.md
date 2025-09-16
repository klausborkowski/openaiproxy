# GoProxyAI - OpenAI API Proxy Service

A high-performance HTTP service built in Go that forwards OpenAI API requests through a configurable proxy server with intelligent caching, rate limiting, and comprehensive observability.

## Features

- 🚀 **Request Proxying** - Forward all requests to OpenAI API through configurable proxy server
- ⚡ **Rate Limiting** - Token bucket algorithm per client IP to prevent API abuse
- 💾 **Intelligent Caching** - In-memory TTL-based caching for improved performance
- 📊 **Observability** - Structured logging, health checks, and basic metrics
- ⚙️ **Configuration** - Flexible configuration via environment variables
- 🔒 **Security** - No API key storage, direct header passthrough

Built with Go 1.21+ and Gin framework for production reliability.

---



## Request Processing Flow

1. **HTTP Request** → Client sends request to GoProxyAI
2. **Rate Limiting** → Check IP-based rate limits using token bucket
3. **Logging** → Log incoming request details
4. **Cache Check** → Search cache using key (method + path + headers + body)
5. **Cache Hit** → Return cached response (with X-Cache: HIT header)
6. **Cache Miss** → Forward request through proxy to OpenAI API
7. **Response Caching** → Store response in cache (if applicable)
8. **HTTP Response** → Return response to client (with X-Cache: MISS header)

---

## Quick Start

### Prerequisites

- Go 1.21 or higher
- OpenAI API key

### Installation and Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd goproxyai
```

2. Install dependencies:
```bash
go mod download
```

3. Configure environment variables (optional):
```bash
export PORT=8080
export OPENAI_API_URL=https://api.openai.com
export RATE_LIMIT=60
export CACHE_TTL=5m
export REQUEST_TIMEOUT=30s
export MAX_CACHE_SIZE=100
# export PROXY_URL=http://your-proxy-server:port  # If proxy needed
```

4. Run the service:
```bash
go run cmd/server/main.go
```

Service will be available at `http://localhost:8080`

---

## API Documentation

### Core Proxy Endpoints

#### OpenAI API Proxying
**URL:** `/v1/*` (all OpenAI API paths)  
**Methods:** `GET`, `POST`, `PUT`, `DELETE`, `PATCH`  
**Description:** Forwards all requests to OpenAI API with caching and rate limiting

**Headers:**
- `Authorization` - Bearer token for OpenAI API
- `Content-Type` - Request content type
- `Accept` - Response content type preference
- `User-Agent` - Client identification
- `X-OpenAI-Organization` - OpenAI organization ID

**Response Headers:**
- `X-Cache` - Cache status: `HIT`, `MISS`
- `X-Cache-Timestamp` - Cache entry timestamp (for hits)
- `X-Proxy` - Proxy service identifier

**Usage Examples:**

```bash
# Instead of direct OpenAI call:
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"

# Use through proxy:
curl http://localhost:8080/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Request/Response Models:**

```go
// Standard OpenAI Chat Completion Request
type ChatCompletionRequest struct {
    Model       string    `json:"model"`
    Messages    []Message `json:"messages"`
    Temperature *float64  `json:"temperature,omitempty"`
    MaxTokens   *int      `json:"max_tokens,omitempty"`
    Stream      *bool     `json:"stream,omitempty"`
    // ... other OpenAI parameters
}

type Message struct {
    Role    string `json:"role"`    // "system", "user", "assistant"
    Content string `json:"content"`
}

// Standard OpenAI Response
type ChatCompletionResponse struct {
    ID      string   `json:"id"`
    Object  string   `json:"object"`
    Created int64    `json:"created"`
    Model   string   `json:"model"`
    Choices []Choice `json:"choices"`
    Usage   Usage    `json:"usage"`
}

type Choice struct {
    Index        int     `json:"index"`
    Message      Message `json:"message"`
    FinishReason string  `json:"finish_reason"`
}

type Usage struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
    TotalTokens      int `json:"total_tokens"`
}

// Error Response
type ErrorResponse struct {
    Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
    Message string `json:"message"`
    Type    string `json:"type"`
    Code    string `json:"code,omitempty"`
}
```

### System Endpoints

#### GET /health
Health check endpoint for monitoring and load balancers.

**Response:**
```json
{
  "status": "healthy",
  "service": "openai-proxy",
  "timestamp": "1234567890"
}
```

#### GET /stats
Service statistics and cache metrics.

**Response:**
```json
{
  "cache": {
    "item_count": 42,
    "ttl": "5m0s"
  },
  "rate_limit": 60,
  "proxy_url": "http://proxy:8080",
  "openai_url": "https://api.openai.com"
}
```

#### DELETE /cache
Clear all cached entries.

**Response:**
```json
{
  "message": "Cache cleared successfully"
}
```

---

## Component Architecture

### 💾 Cache Component

**Purpose:** In-memory TTL-based caching with intelligent key generation.

**Key Features:**
- **TTL Expiration:** Configurable time-to-live for cache entries
- **Smart Key Generation:** SHA256 hash of method + path + relevant headers + body
- **Selective Caching:** Only caches GET requests and specific POST endpoints
- **Response Filtering:** Caches successful responses and certain error codes

**Internal Structure:**
```go
type CacheEntry struct {
    StatusCode int                 `json:"status_code"`
    Headers    map[string][]string `json:"headers"`
    Body       []byte              `json:"body"`
    Timestamp  time.Time           `json:"timestamp"`
}
```

**Cache Key Generation:**
```go
keyData := {
    Method:  "POST",
    Path:    "/v1/chat/completions",
    Headers: {
        "Authorization": "Bearer sk-...",
        "Content-Type": "application/json"
    },
    Body: `{"model":"gpt-3.5-turbo","messages":[...]}`
}
// SHA256 hash of JSON-marshaled keyData
```

**Cacheable Requests:**
- ✅ All GET requests
- ✅ POST `/v1/chat/completions`
- ✅ POST `/v1/completions`
- ✅ POST `/v1/embeddings`

**Cacheable Responses:**
- ✅ 200, 201 (Success)
- ✅ 400, 401 (Client errors)
- ❌ 5xx (Server errors)

**Configuration:**
- `CACHE_TTL` - Cache entry time-to-live
- `MAX_CACHE_SIZE` - Maximum cache size in MB

### ⚡ Rate Limiter Component

**Purpose:** Token bucket rate limiting per client IP to prevent API abuse.

**Algorithm:** Token Bucket with `golang.org/x/time/rate`
- Each client IP gets separate token bucket
- Tokens refill at constant rate (requests/minute → requests/second)
- Burst capacity equals requests per minute
- Automatic cleanup of inactive limiters

**Client Identification:**
- Uses `c.ClientIP()` from Gin context
- Handles X-Forwarded-For headers
- Falls back to connection remote address

**Token Bucket Structure:**
```go
type RateLimiter struct {
    limiters map[string]*rate.Limiter  // IP -> limiter
    mutex    sync.RWMutex              // Thread safety
    rate     rate.Limit                // Requests per second
    burst    int                       // Max burst capacity
    cleanup  time.Duration             // Cleanup interval
}
```

**Operations:**
- `getLimiter(ip)` - Get or create limiter for IP
- `Allow()` - Check if request allowed, consume token
- `cleanupRoutine()` - Periodic cleanup of old limiters

**Rate Limiting Logic:**
```go
// Convert requests/minute to requests/second
rate := rate.Limit(float64(requestsPerMinute) / 60.0)
burst := requestsPerMinute

limiter := rate.NewLimiter(rate, burst)
allowed := limiter.Allow()
```

**Response Behavior:**
- **Allowed:** Request proceeds to next middleware
- **Rate Limited:** HTTP 429 with error response:
```json
{
  "error": "Rate limit exceeded. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

**Configuration:**
- `RATE_LIMIT` - Requests per minute per IP (default: 60)
- Cleanup interval: 5 minutes
- Burst capacity: Same as rate limit

---

## Configuration

### Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `PORT` | HTTP server port | `8080` |
| `PROXY_URL` | Proxy server URL (optional) | `""` (direct connection) |
| `OPENAI_API_URL` | OpenAI API base URL | `https://api.openai.com` |
| `RATE_LIMIT` | Requests per minute per IP | `60` |
| `CACHE_TTL` | Cache entry time-to-live | `5m` |
| `REQUEST_TIMEOUT` | HTTP request timeout | `30s` |
| `MAX_CACHE_SIZE` | Maximum cache size in MB | `100` |

### Cache Behavior

**Cached Requests:**
- ✅ GET requests (models, files, etc.)
- ✅ POST chat completions, completions, embeddings
- ✅ Successful responses (2xx)
- ✅ Client errors (400, 401) for debugging

**Bypassed Requests:**
- ❌ Non-cacheable POST endpoints
- ❌ PUT, DELETE, PATCH requests
- ❌ Server errors (5xx)
- ❌ Requests with non-standard headers

### Rate Limiting Behavior

**Per-IP Limits:**
- Each unique IP gets separate token bucket
- Tokens refill continuously at configured rate
- Burst capacity allows temporary spikes
- Automatic cleanup prevents memory leaks

**HTTP Status Codes:**
- `200` - Request allowed, token consumed
- `429` - Rate limited, retry later

---

## Development

### Project Structure
```
goproxyai/
├── cmd/
│   └── server/
│       └── main.go          # Application entry point
├── internal/
│   ├── cache/
│   │   └── cache.go         # Caching logic and TTL management
│   ├── config/
│   │   └── config.go        # Environment configuration
│   ├── middleware/
│   │   ├── logging.go       # Request logging middleware
│   │   └── ratelimit.go     # Rate limiting middleware
│   ├── proxy/
│   │   └── client.go        # HTTP client for proxying
│   └── server/
│       └── server.go        # HTTP server and routing
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

### Running Tests
```bash
go test ./...
```

### Building
```bash
# Development build
go build -o goproxyai cmd/server/main.go

# Production build with optimizations
go build -ldflags="-w -s" -o goproxyai cmd/server/main.go
```

### Using Makefile
```bash
# Build binary
make build

# Run service
make run

# Run tests
make test

# Clean build artifacts
make clean
```

---

## Usage Examples

### Chat Completion Request
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 150
  }'
```

### List Available Models
```bash
curl http://localhost:8080/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Generate Embeddings
```bash
curl -X POST http://localhost:8080/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": "The food was delicious and the waiter was very friendly."
  }'
```

### Check Service Statistics
```bash
curl http://localhost:8080/stats
```

### Health Check
```bash
curl http://localhost:8080/health
```

### Clear Cache
```bash
curl -X DELETE http://localhost:8080/cache
```

---

## Production Deployment

### Docker

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-w -s" -o goproxyai cmd/server/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/goproxyai .
EXPOSE 8080
CMD ["./goproxyai"]
```

### Performance Considerations

- **Memory Usage:** Cache size directly impacts memory consumption
- **Rate Limiting:** Adjust based on expected concurrent users
- **Timeouts:** Configure appropriate timeouts for your use case
- **Proxy Configuration:** Use connection pooling for high throughput

### Security

- Service doesn't store API keys
- All authorization headers passed through directly
- Rate limiting prevents abuse
- Use HTTPS in production
- Consider API key rotation policies
- Monitor rate limiting effectiveness

### Monitoring

The service provides metrics for monitoring:

- **Request Metrics:** Total requests, response times
- **Cache Metrics:** Hit/miss ratios, cache size, TTL
- **Rate Limit Metrics:** Limited requests per IP
- **Error Metrics:** Proxy errors, timeout errors

Integrate with monitoring tools like Prometheus, Grafana, or custom dashboards.

---

## Architectural Decisions and Trade-offs

### Caching Strategy

**Benefits:**
- Reduces OpenAI API calls and costs
- Improves response times for repeated requests
- Handles identical requests efficiently

**Trade-offs:**
- In-memory storage (not persistent across restarts)
- May serve stale data within TTL window
- POST request caching may be controversial

### Rate Limiting Approach

**Benefits:**
- Prevents API quota exhaustion
- Protects against abuse and DoS
- Fair usage across multiple clients

**Trade-offs:**
- In-memory state doesn't scale across instances
- IP-based limiting may affect users behind NAT
- Simple cleanup strategy may be too aggressive

### Error Handling

**Approach:**
- Graceful network error handling
- Proper HTTP status code propagation
- Comprehensive error logging

**Future Improvements:**
- Retry logic with exponential backoff
- Circuit breaker pattern
- Health check integration

---
