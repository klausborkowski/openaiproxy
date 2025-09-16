package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port           string
	ProxyURL       string
	OpenAIAPIURL   string
	RateLimit      int // requests per minute
	CacheTTL       time.Duration
	RequestTimeout time.Duration
	MaxCacheSize   int64 // max cache size in MB
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		ProxyURL:       getEnv("PROXY_URL", ""),
		OpenAIAPIURL:   getEnv("OPENAI_API_URL", "https://api.openai.com"),
		RateLimit:      getEnvInt("RATE_LIMIT", 60), // 60 requests per minute by default
		CacheTTL:       getEnvDuration("CACHE_TTL", "5m"),
		RequestTimeout: getEnvDuration("REQUEST_TIMEOUT", "30s"),
		MaxCacheSize:   getEnvInt64("MAX_CACHE_SIZE", 100), // 100MB by default
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue string) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	duration, _ := time.ParseDuration(defaultValue)
	return duration
}
