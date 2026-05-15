const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

export function isIPv4(ipAddress: string): boolean {
  if (!IPV4_PATTERN.test(ipAddress)) {
    return false;
  }
  return ipAddress.split(".").every((octet) => {
    const n = Number(octet);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

export function isIPv6(ipAddress: string): boolean {
  if (!ipAddress.includes(":") || !IPV6_PATTERN.test(ipAddress)) {
    return false;
  }
  const groups = expandIPv6Groups(ipAddress);
  return groups !== null && groups.length === 8;
}

function expandIPv6Groups(ipAddress: string): string[] | null {
  const lower = ipAddress.toLowerCase();
  let head = lower;
  let tail = "";

  if (lower.includes("::")) {
    const parts = lower.split("::");
    if (parts.length !== 2) {
      return null;
    }
    head = parts[0] ?? "";
    tail = parts[1] ?? "";
  }

  const headGroups = head.length ? head.split(":") : [];
  const tailGroups = tail.length ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;

  if (missing < 0) {
    return null;
  }

  const groups = [
    ...headGroups,
    ...Array.from({ length: missing }, () => "0"),
    ...tailGroups,
  ];

  if (groups.length !== 8) {
    return null;
  }

  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return null;
    }
  }

  return groups.map((g) => g.padStart(4, "0").toLowerCase());
}

function maskIPv4(ipAddress: string): string {
  const parts = ipAddress.split(".");
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
}

function maskIPv6(ipAddress: string): string {
  const groups = expandIPv6Groups(ipAddress);
  if (!groups) {
    return maskUnknown(ipAddress);
  }
  return `${groups[0]}:${groups[1]}:${groups[2]}:xxxx:xxxx:xxxx:xxxx:xxxx`;
}

function maskUnknown(ipAddress: string): string {
  if (!ipAddress.length) {
    return ipAddress;
  }
  const maskLength = Math.ceil(ipAddress.length * 0.25);
  return ipAddress.slice(0, -maskLength) + "x".repeat(maskLength);
}

export function maskIpAddress(ipAddress: string): string {
  if (isIPv4(ipAddress)) {
    return maskIPv4(ipAddress);
  }
  if (isIPv6(ipAddress)) {
    return maskIPv6(ipAddress);
  }
  return maskUnknown(ipAddress);
}
