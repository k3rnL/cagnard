/* Cagnard Pages demo boot loader.
 *
 * Registers the demo service worker, waits until it controls the page and
 * the WebAssembly backend answers, then starts the unmodified frontend
 * bundle whose entry the assembly step recorded in window.__cagnardAppEntry.
 *
 * Stale registrations are healed before boot: foreign-scope workers from
 * older deployments are unregistered, and if a stale worker still controls
 * the page after registration, the loader reloads once so the current
 * worker takes over. */

(async () => {
  // Vite hoists scripts into <head>; wait until <body> exists.
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true })
    );
  }

  const status = document.createElement("div");
  status.setAttribute(
    "style",
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
      "font:15px/1.5 system-ui,sans-serif;color:#8a8f98;background:#101112;text-align:center;padding:2rem;"
  );
  status.textContent = "Starting the Cagnard demo backend…";
  document.body.appendChild(status);

  const expectedScope = new URL("./", location.href).href;
  const expectedScript = new URL("./demo-sw.js", location.href).href;

  function controlledByCurrentWorker() {
    const controller = navigator.serviceWorker.controller;
    return controller !== null && controller.scriptURL === expectedScript;
  }

  try {
    if (!("serviceWorker" in navigator)) {
      throw new Error("This browser does not support service workers.");
    }

    // Remove workers from other scopes or older script URLs; they would
    // otherwise keep answering /api with a stale backend.
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      if (registration.scope !== expectedScope) {
        await registration.unregister();
      }
    }

    await navigator.serviceWorker.register("./demo-sw.js");
    await navigator.serviceWorker.ready;

    if (!controlledByCurrentWorker()) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    }
    if (!controlledByCurrentWorker()) {
      // A stale worker still controls this page; one reload hands control
      // to the freshly registered one. The flag prevents a reload loop.
      if (sessionStorage.getItem("cagnard-demo-reloaded") !== "1") {
        sessionStorage.setItem("cagnard-demo-reloaded", "1");
        location.reload();
        return;
      }
      throw new Error("a stale service worker keeps control of this page; close all demo tabs and reopen");
    }
    sessionStorage.removeItem("cagnard-demo-reloaded");

    status.textContent = "Loading the demo backend (about 3 MB)…";
    const health = await fetch("/api/health");
    if (!health.ok) {
      throw new Error(`demo backend health check failed with ${health.status}`);
    }

    status.remove();
    const script = document.createElement("script");
    script.type = "module";
    script.crossOrigin = "";
    script.src = window.__cagnardAppEntry;
    document.body.appendChild(script);
  } catch (error) {
    status.textContent = `The demo could not start: ${error instanceof Error ? error.message : error}`;
  }
})();
