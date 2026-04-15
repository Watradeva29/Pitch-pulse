import { io } from "socket.io-client";
import { API_BASE } from "./api";

export function createSocket() {
  if (import.meta.env.DEV) {
    return io(API_BASE, {
      autoConnect: true,
    });
  }
  const base = String(import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return io(window.location.origin, {
    path: `${base || ""}/socket.io`,
    autoConnect: true,
  });
}

