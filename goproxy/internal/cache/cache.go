package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/patrickmn/go-cache"
)

type Cache struct {
	store *cache.Cache
	ttl   time.Duration
}

type CacheEntry struct {
	StatusCode int                 `json:"status_code"`
	Headers    map[string][]string `json:"headers"`
	Body       []byte              `json:"body"`
	Timestamp  time.Time           `json:"timestamp"`
}

func New(ttl time.Duration, maxSizeMB int64) *Cache {
	// Assuming average response size of 1KB, 1MB = ~1000 items
	cleanupInterval := ttl / 2
	if cleanupInterval < time.Minute {
		cleanupInterval = time.Minute
	}

	return &Cache{
		store: cache.New(ttl, cleanupInterval),
		ttl:   ttl,
	}
}

func (c *Cache) generateKey(method, path string, headers map[string]string, body []byte) string {
	// Create a unique key based on method, path, relevant headers, and body
	keyData := struct {
		Method  string            `json:"method"`
		Path    string            `json:"path"`
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body"`
	}{
		Method:  method,
		Path:    path,
		Headers: c.filterCacheableHeaders(headers),
		Body:    string(body),
	}

	keyBytes, _ := json.Marshal(keyData)
	hash := sha256.Sum256(keyBytes)
	return hex.EncodeToString(hash[:])
}

func (c *Cache) filterCacheableHeaders(headers map[string]string) map[string]string {
	// Only include headers that affect the response content
	cacheableHeaders := make(map[string]string)

	relevantHeaders := []string{
		"Authorization",
		"Content-Type",
		"Accept",
		"User-Agent",
		"X-OpenAI-Organization",
	}

	for _, header := range relevantHeaders {
		if value, exists := headers[header]; exists {
			cacheableHeaders[header] = value
		}
	}

	return cacheableHeaders
}

func (c *Cache) Get(method, path string, headers map[string]string, body []byte) (*CacheEntry, bool) {
	// Only cache GET requests and certain POST requests
	if !c.isCacheable(method, path) {
		return nil, false
	}

	key := c.generateKey(method, path, headers, body)

	if item, found := c.store.Get(key); found {
		if entry, ok := item.(*CacheEntry); ok {
			return entry, true
		}
	}

	return nil, false
}

func (c *Cache) Set(method, path string, headers map[string]string, body []byte, response *CacheEntry) {
	// Only cache successful responses and certain error codes
	if !c.isCacheable(method, path) || !c.isCacheableResponse(response.StatusCode) {
		return
	}

	key := c.generateKey(method, path, headers, body)
	response.Timestamp = time.Now()

	c.store.Set(key, response, c.ttl)
}

func (c *Cache) isCacheable(method, path string) bool {
	// Cache GET requests
	if method == "GET" {
		return true
	}

	// Cache certain POST requests (like completions) for a short time
	if method == "POST" {
		cacheablePaths := []string{
			"/v1/chat/completions",
			"/v1/completions",
			"/v1/embeddings",
		}

		for _, cachePath := range cacheablePaths {
			if path == cachePath {
				return true
			}
		}
	}

	return false
}

func (c *Cache) isCacheableResponse(statusCode int) bool {
	// Cache successful responses and some client errors
	return statusCode == 200 || statusCode == 201 || statusCode == 400 || statusCode == 401
}

func (c *Cache) Stats() map[string]interface{} {
	itemCount := c.store.ItemCount()

	return map[string]interface{}{
		"item_count": itemCount,
		"ttl":        c.ttl.String(),
	}
}

func (c *Cache) Clear() {
	c.store.Flush()
}
