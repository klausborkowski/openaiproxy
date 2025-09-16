package main

import (
	"log"
	"os"

	"goproxyai/internal/config"
	"goproxyai/internal/server"
)

func main() {
	cfg := config.Load()

	srv := server.New(cfg)

	log.Printf("Starting server on port %s", cfg.Port)
	if err := srv.Run(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
		os.Exit(1)
	}
}
