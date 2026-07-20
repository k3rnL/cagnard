//go:build js && wasm

// Command cagnard-wasm exposes the Cagnard API handler to JavaScript as
// globalThis.cagnard.handle, so the frontend can serve /api requests from a
// WebAssembly module instead of a network backend.
package main

import (
	"bytes"
	"fmt"
	"net/http"
	"syscall/js"

	"github.com/k3rnl/cagnard/backend-go/internal/api"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func main() {
	handler := api.NewServer(demoConfig()).Handler()

	bridge := js.Global().Get("Object").New()
	bridge.Set("handle", js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 {
			return rejectedPromise("cagnard.handle expects one request object")
		}
		request, err := requestFromJS(args[0])
		if err != nil {
			return rejectedPromise(err.Error())
		}
		return servePromise(handler, request)
	}))
	js.Global().Set("cagnard", bridge)

	if ready := js.Global().Get("__onCagnardReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}

type bridgeRequest struct {
	method  string
	url     string
	headers map[string]string
	body    []byte
}

func requestFromJS(value js.Value) (bridgeRequest, error) {
	if value.Type() != js.TypeObject {
		return bridgeRequest{}, fmt.Errorf("request must be an object")
	}
	request := bridgeRequest{
		method:  value.Get("method").String(),
		url:     value.Get("url").String(),
		headers: map[string]string{},
	}
	if headers := value.Get("headers"); headers.Type() == js.TypeObject {
		keys := js.Global().Get("Object").Call("keys", headers)
		for idx := 0; idx < keys.Length(); idx++ {
			key := keys.Index(idx).String()
			request.headers[key] = headers.Get(key).String()
		}
	}
	if body := value.Get("body"); body.Truthy() {
		request.body = make([]byte, body.Get("length").Int())
		js.CopyBytesToGo(request.body, body)
	}
	return request, nil
}

func servePromise(handler http.Handler, request bridgeRequest) js.Value {
	executor := js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve := args[0]
		reject := args[1]
		go func() {
			defer func() {
				if recovered := recover(); recovered != nil {
					reject.Invoke(fmt.Sprintf("cagnard handler panic: %v", recovered))
				}
			}()
			resolve.Invoke(serve(handler, request))
		}()
		return nil
	})
	defer executor.Release()
	return js.Global().Get("Promise").New(executor)
}

func serve(handler http.Handler, request bridgeRequest) js.Value {
	httpRequest, err := http.NewRequest(request.method, request.url, bytes.NewReader(request.body))
	if err != nil {
		return responseToJS(http.StatusBadRequest, http.Header{}, []byte(err.Error()))
	}
	for key, value := range request.headers {
		httpRequest.Header.Set(key, value)
	}

	recorder := &bufferedResponse{header: http.Header{}, status: http.StatusOK}
	handler.ServeHTTP(recorder, httpRequest)
	return responseToJS(recorder.status, recorder.header, recorder.body.Bytes())
}

func responseToJS(status int, header http.Header, body []byte) js.Value {
	headers := js.Global().Get("Object").New()
	for key, values := range header {
		list := js.Global().Get("Array").New()
		for _, value := range values {
			list.Call("push", value)
		}
		headers.Set(key, list)
	}
	bodyValue := js.Global().Get("Uint8Array").New(len(body))
	js.CopyBytesToJS(bodyValue, body)

	response := js.Global().Get("Object").New()
	response.Set("status", status)
	response.Set("headers", headers)
	response.Set("body", bodyValue)
	return response
}

func rejectedPromise(message string) js.Value {
	return js.Global().Get("Promise").Call("reject", js.Global().Get("Error").New(message))
}

type bufferedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (r *bufferedResponse) Header() http.Header {
	return r.header
}

func (r *bufferedResponse) WriteHeader(status int) {
	r.status = status
}

func (r *bufferedResponse) Write(bytes []byte) (int, error) {
	return r.body.Write(bytes)
}

// demoDataURL resolves the absolute URL of the published demo corpus. The
// frontend bridge sets __cagnardDemoDataURL before starting the module; a
// location-derived fallback keeps direct embedding working.
func demoDataURL() string {
	if value := js.Global().Get("__cagnardDemoDataURL"); value.Type() == js.TypeString && value.String() != "" {
		return value.String()
	}
	location := js.Global().Get("location")
	if location.Type() == js.TypeObject {
		return location.Get("origin").String() + "/demo-data"
	}
	return "http://127.0.0.1/demo-data"
}

// demoConfig serves the published examples/storage/global corpus through the
// read-only http provider; there is no personal storage in the demo.
func demoConfig() *config.CagnardConfig {
	mode := "static"
	signingSecret := "wasm-demo-cagnard-session-signing-secret"
	providerID := "static"
	providerLabel := "Cagnard account"
	enabled := true
	sharedLabel := "Global"
	return &config.CagnardConfig{
		Server: config.ServerConfig{Host: "wasm", Port: 0},
		// GitHub Pages compresses responses and rejects ranged HEAD requests,
		// so browser query engines must read the corpus files whole.
		StructuredData: config.StructuredDataConfig{DirectContentFullReads: true},
		Auth: config.AuthConfig{
			Mode:                   &mode,
			ConfiguredUsersEnabled: true,
			Session:                &config.SessionConfig{SigningSecret: &signingSecret},
			StaticProvider:         &config.StaticProviderConfig{ID: &providerID, Label: &providerLabel, Enabled: &enabled},
		},
		Users: []config.ConfiguredUser{
			{
				ID:          "alice",
				DisplayName: "Alice Example",
				Roles:       []string{"user", "admin"},
				Groups:      []string{"engineering"},
				Claims:      map[string]string{"email": "alice@example.test"},
				// Demo password: cagnard
				Credential: &config.StaticUserCredentialConfig{
					Verifier: "pbkdf2-sha256:120000:Y2FnbmFyZC1kZW1vLXN0YXRpYy11c2VyLXNhbHQ:fUdgpOu_Z3MHhgdWzUku12tWnSH5s9BhfjJVv1fiIms",
				},
			},
		},
		Providers: []config.ProviderConfig{
			{
				ID:          "demo-http",
				Type:        "http",
				Family:      "http",
				DisplayName: "Demo corpus",
				Settings:    map[string]string{"baseUrl": demoDataURL()},
			},
		},
		Accounts: []config.StorageAccountConfig{
			{ID: "demo-readonly", ProviderID: "demo-http", DisplayName: "Read-only demo account", Enabled: true, ReadOnly: true, AuthMode: "none"},
		},
		GlobalStorage: []config.StorageRootConfig{
			{ID: "shared", Label: &sharedLabel, ProviderID: "demo-http", AccountID: "demo-readonly", AllowedRoles: []string{"user", "admin"}},
		},
	}
}
