"use client";

import { useEffect } from "react";

/** Registrerar service workern (för pushnotiser) – utan inline-skript, så att CSP kan vara strikt. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
