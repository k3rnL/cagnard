/* Cagnard Pages demo service worker.
 *
 * Hosts the Go backend compiled to WebAssembly and answers every /api
 * request from it, for the page and its workers alike. The frontend bundle
 * runs unmodified. Set-Cookie cannot cross a service-worker-constructed
 * Response, so the session cookie lives here: extracted from backend
 * responses, persisted through the Cache API, and injected into backend
 * requests. */

/* global Go */
importScripts("./wasm_exec.js");

const SESSION_CACHE = "cagnard-demo-session";
const SESSION_KEY = "/__cagnard-session-cookie";

let cookieHeader = "";
let backendPromise = null;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(handleApi(event.request));
  }
});

function startBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const scope = self.registration.scope;
      globalThis.__cagnardDemoDataURL = new URL("demo-data", scope).href;
      const ready = new Promise((resolve) => {
        globalThis.__onCagnardReady = resolve;
      });
      const go = new Go();
      // Revalidate on every boot: a plain fetch may serve a stale cached
      // wasm for the whole max-age window after a deploy.
      const response = await fetch(new URL("cagnard.wasm", scope).href, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`cagnard.wasm fetch failed with ${response.status}`);
      }
      const wasm = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
      void go.run(wasm.instance);
      await ready;
      cookieHeader = await readStoredCookie();
      return globalThis.cagnard;
    })();
    backendPromise.catch(() => {
      backendPromise = null;
    });
  }
  return backendPromise;
}

async function handleApi(request) {
  const backend = await startBackend();
  const url = new URL(request.url);

  const headers = {};
  for (const [key, value] of request.headers) {
    headers[key] = value;
  }
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) {
      body = new Uint8Array(buffer);
    }
  }

  const result = await backend.handle({
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body,
  });

  const responseHeaders = new Headers();
  let setCookie = null;
  for (const [key, values] of Object.entries(result.headers)) {
    if (key.toLowerCase() === "set-cookie") {
      setCookie = values[0] ?? "";
      continue;
    }
    for (const value of values) {
      responseHeaders.append(key, value);
    }
  }
  if (setCookie !== null) {
    const pair = setCookie.split(";")[0].trim();
    cookieHeader = /=.+/.test(pair) ? pair : "";
    await storeCookie(cookieHeader);
  }

  const status = result.status;
  const responseBody = status === 204 || status === 205 || status === 304 ? null : result.body;
  return new Response(responseBody, { status, headers: responseHeaders });
}

async function readStoredCookie() {
  try {
    const cache = await caches.open(SESSION_CACHE);
    const stored = await cache.match(SESSION_KEY);
    return stored ? await stored.text() : "";
  } catch {
    return "";
  }
}

async function storeCookie(value) {
  try {
    const cache = await caches.open(SESSION_CACHE);
    if (value) {
      await cache.put(SESSION_KEY, new Response(value));
    } else {
      await cache.delete(SESSION_KEY);
    }
  } catch {
    // Session persistence is best-effort; a lost cookie only means a login.
  }
}
