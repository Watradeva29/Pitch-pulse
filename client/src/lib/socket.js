import { io } from "socket.io-client";
import { API_BASE } from "./api";

export function createSocket() {
  if (import.meta.env.DEV) {
    return io(API_BASE, {
      autoConnect: false,
    });
  }
  return io(window.location.origin, {
    autoConnect: false,
  });
}

