import { env } from "../config/env.js";
import { sha256Hex } from "./tokenHash.js";

export function hashIP(ipAddress: string): string {
  return sha256Hex(`${ipAddress}:${env.IP_HASH_SALT}`);
}
