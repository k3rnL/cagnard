package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/api"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}

func run(args []string) error {
	configPath := selectedConfigPath(args)
	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}

	address := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	server := &http.Server{
		Addr:              address,
		Handler:           api.NewServer(cfg).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		log.Printf("Cagnard Go backend listening on %s", address)
		errs <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-signals:
		log.Printf("received %s, shutting down", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(ctx)
	case err := <-errs:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func selectedConfigPath(args []string) string {
	if value := os.Getenv("CAGNARD_CONFIG"); value != "" {
		return value
	}
	if len(args) > 0 && args[0] != "" {
		return args[0]
	}
	if _, err := os.Stat(filepath.Join("config", "cagnard.example.conf")); err == nil {
		return filepath.Join("config", "cagnard.example.conf")
	}
	return filepath.Join("..", "config", "cagnard.example.conf")
}
