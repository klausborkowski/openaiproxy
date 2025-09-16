package proxy

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	httpClient   *http.Client
	proxyURL     string
	openAIAPIURL string
	timeout      time.Duration
}

func NewClient(proxyURL, openAIAPIURL string, timeout time.Duration) *Client {
	client := &http.Client{
		Timeout: timeout,
	}

	// Configure proxy if provided
	if proxyURL != "" {
		if proxyURLParsed, err := url.Parse(proxyURL); err == nil {
			client.Transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURLParsed),
			}
		}
	}

	return &Client{
		httpClient:   client,
		proxyURL:     proxyURL,
		openAIAPIURL: openAIAPIURL,
		timeout:      timeout,
	}
}

type ProxyRequest struct {
	Method  string
	Path    string
	Headers map[string]string
	Body    []byte
}

type ProxyResponse struct {
	StatusCode int
	Headers    map[string][]string
	Body       []byte
}

func (c *Client) Forward(ctx context.Context, req *ProxyRequest) (*ProxyResponse, error) {
	targetURL := c.openAIAPIURL + req.Path

	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = bytes.NewReader(req.Body)
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, targetURL, bodyReader)
	if err != nil {
		return nil, err
	}

	for key, value := range req.Headers {
		httpReq.Header.Set(key, value)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	headers := make(map[string][]string)
	for key, values := range resp.Header {
		headers[key] = values
	}

	return &ProxyResponse{
		StatusCode: resp.StatusCode,
		Headers:    headers,
		Body:       respBody,
	}, nil
}
