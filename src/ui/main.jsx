/* Where the gym starts. */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("app")).render(<App />);

/* Offline. Guarded by PROD because registering a worker against the dev
   server caches the dev server, and then an edit you just made is not the
   page you are looking at - an afternoon lost to that is an afternoon you
   do not get back. Vite drops this whole block from the dev bundle. */
if (import.meta.env.PROD && "serviceWorker" in navigator
    && location.protocol.startsWith("http")) {
  window.addEventListener("load",
    () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
