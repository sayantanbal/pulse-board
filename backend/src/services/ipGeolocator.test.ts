import { afterEach, describe, expect, it } from "vitest";
import { clearCache, lookup, resetGeolocatorForTests } from "./ipGeolocator.service.js";

describe("ipGeolocator", () => {
  afterEach(() => {
    resetGeolocatorForTests();
  });

  it("returns null geolocation for private IPs", async () => {
    const result = await lookup("192.168.1.1");
    expect(result).toEqual({ country: null, region: null, city: null });
  });

  it("returns null geolocation for loopback", async () => {
    const result = await lookup("127.0.0.1");
    expect(result).toEqual({ country: null, region: null, city: null });
  });

  it("handles IPv4-mapped IPv6 addresses", async () => {
    const result = await lookup("::ffff:192.168.1.10");
    expect(result).toEqual({ country: null, region: null, city: null });
  });

  it("caches repeated lookups", async () => {
    clearCache();
    const first = await lookup("8.8.8.8");
    const second = await lookup("8.8.8.8");
    expect(second).toEqual(first);
  });
});
