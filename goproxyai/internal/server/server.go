package server

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"goproxyai/internal/cache"
	"goproxyai/internal/config"
	"goproxyai/internal/middleware"
	"goproxyai/internal/proxy"
)

type Server struct {
	config      *config.Config
	proxyClient *proxy.Client
	cache       *cache.Cache
	rateLimiter *middleware.RateLimiter
	router      *gin.Engine
	logger      *log.Logger
}

func New(cfg *config.Config) *Server {
	logger := log.New(os.Stdout, "[PROXY] ", log.LstdFlags|log.Lshortfile)

	proxyClient := proxy.NewClient(cfg.ProxyURL, cfg.OpenAIAPIURL, cfg.RequestTimeout)
	cacheInstance := cache.New(cfg.CacheTTL, cfg.MaxCacheSize)
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimit)

	if cfg.Port == "8080" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// midlewares:
	router.Use(middleware.RequestLogger())
	router.Use(gin.Recovery())
	router.Use(rateLimiter.Middleware())

	srv := &Server{
		config:      cfg,
		proxyClient: proxyClient,
		cache:       cacheInstance,
		rateLimiter: rateLimiter,
		router:      router,
		logger:      logger,
	}

	srv.setupRoutes()
	return srv
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", s.healthCheck)

	s.router.GET("/stats", s.getStats)

	s.router.DELETE("/cache", s.clearCache)

	s.router.Any("/v1/*path", s.proxyHandler)
	s.router.Any("/v1", s.proxyHandler)
}

func (s *Server) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "openai-proxy",
		"timestamp": fmt.Sprintf("%d", c.Request.Context().Value("timestamp")),
	})
}

func (s *Server) getStats(c *gin.Context) {
	stats := s.cache.Stats()

	c.JSON(http.StatusOK, gin.H{
		"cache":      stats,
		"rate_limit": s.config.RateLimit,
		"proxy_url":  s.config.ProxyURL,
		"openai_url": s.config.OpenAIAPIURL,
	})
}

func (s *Server) clearCache(c *gin.Context) {
	s.cache.Clear()
	s.logger.Println("Cache cleared manually")

	c.JSON(http.StatusOK, gin.H{
		"message": "Cache cleared successfully",
	})
}

func (s *Server) proxyHandler(c *gin.Context) {
	method := c.Request.Method
	path := "/v1" + c.Param("path")
	if path == "/v1" {
		path = "/v1/"
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		s.logger.Printf("Error reading request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	headers := make(map[string]string)
	for key, values := range c.Request.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	if cacheEntry, found := s.cache.Get(method, path, headers, bodyBytes); found {
		s.logger.Printf("Cache hit for %s %s", method, path)

		for key, values := range cacheEntry.Headers {
			for _, value := range values {
				c.Header(key, value)
			}
		}

		c.Header("X-Cache", "HIT")
		c.Header("X-Cache-Timestamp", cacheEntry.Timestamp.Format("2006-01-02T15:04:05Z07:00"))

		c.Data(cacheEntry.StatusCode, c.GetHeader("Content-Type"), cacheEntry.Body)
		return
	}

	proxyReq := &proxy.ProxyRequest{
		Method:  method,
		Path:    path,
		Headers: headers,
		Body:    bodyBytes,
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), s.config.RequestTimeout)
	defer cancel()
	proxyResp, err := s.proxyClient.Forward(ctx, proxyReq)
	if err != nil {
		s.logger.Printf("Error forwarding request: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "Failed to forward request to OpenAI API",
			"code":  "PROXY_ERROR",
		})
		return
	}

	for key, values := range proxyResp.Headers {
		for _, value := range values {
			c.Header(key, value)
		}
	}

	c.Header("X-Cache", "MISS")
	c.Header("X-Proxy", "goproxyai")

	cacheEntry := &cache.CacheEntry{
		StatusCode: proxyResp.StatusCode,
		Headers:    proxyResp.Headers,
		Body:       proxyResp.Body,
	}
	s.cache.Set(method, path, headers, bodyBytes, cacheEntry)

	s.logger.Printf("%s %s -> %d (%d bytes)", method, path, proxyResp.StatusCode, len(proxyResp.Body))

	contentType := "application/json"
	if ct := c.GetHeader("Content-Type"); ct != "" {
		contentType = ct
	}

	c.Data(proxyResp.StatusCode, contentType, proxyResp.Body)
}

func (s *Server) Run() error {
	address := ":" + s.config.Port
	s.logger.Printf("Server starting on %s", address)
	s.logger.Printf("Proxy URL: %s", s.getProxyDisplay())
	s.logger.Printf("OpenAI API URL: %s", s.config.OpenAIAPIURL)
	s.logger.Printf("Rate limit: %d requests/minute", s.config.RateLimit)
	s.logger.Printf("Cache TTL: %v", s.config.CacheTTL)

	return s.router.Run(address)
}

func (s *Server) getProxyDisplay() string {
	if s.config.ProxyURL == "" {
		return "none (direct connection)"
	}
	return s.config.ProxyURL
}
