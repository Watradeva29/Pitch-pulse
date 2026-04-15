import { io } from "socket.io-client";
import { API_BASE } from "./api";

export function createSocket() {
  return io(API_BASE, {
    autoConnect: true,
  });
}

