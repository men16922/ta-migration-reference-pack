import type { RouteModel } from './types';

export function stripCidr(ipOrCidr: string): string {
  const idx = ipOrCidr.indexOf('/');
  return idx === -1 ? ipOrCidr.trim() : ipOrCidr.slice(0, idx).trim();
}

export function getPrefixLength(cidr: string): number {
  const parts = cidr.split('/');
  if (parts.length !== 2 || parts[1] === undefined) {
    return 32;
  }
  const len = Number.parseInt(parts[1], 10);
  if (Number.isNaN(len) || len < 0 || len > 32) {
    throw new Error(`Invalid CIDR prefix length in "${cidr}"`);
  }
  return len;
}

export function ipToUint32(ip: string): number {
  const cleanIp = stripCidr(ip);
  const octets = cleanIp.split('.');
  if (octets.length !== 4) {
    throw new Error(`Invalid IPv4 address: "${ip}"`);
  }
  let result = 0;
  for (const octetStr of octets) {
    const val = Number.parseInt(octetStr, 10);
    if (Number.isNaN(val) || val < 0 || val > 255) {
      throw new Error(`Invalid IPv4 octet in "${ip}"`);
    }
    result = ((result << 8) | val) >>> 0;
  }
  return result >>> 0;
}

export function prefixMask(prefixLen: number): number {
  if (prefixLen <= 0) return 0;
  if (prefixLen >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefixLen)) >>> 0;
}

export function prefixContainsIp(prefixCidr: string, targetIp: string): boolean {
  const len = getPrefixLength(prefixCidr);
  const mask = prefixMask(len);
  const netUint = (ipToUint32(prefixCidr) & mask) >>> 0;
  const ipUint = (ipToUint32(targetIp) & mask) >>> 0;
  return netUint === ipUint;
}

export function areInSameSubnet(cidrA: string, cidrB: string): boolean {
  const lenA = getPrefixLength(cidrA);
  const lenB = getPrefixLength(cidrB);
  if (lenA !== lenB) return false;
  return prefixContainsIp(cidrA, stripCidr(cidrB));
}

/**
 * Deterministic Longest-Prefix Match (LPM) across candidate routes in the same VRF.
 * Ties are broken by administrativeDistance (lower wins), then protocol preference
 * (connected > aws-route-table > static), then route ID lexicographically.
 */
export function longestPrefixMatch(
  routes: RouteModel[],
  deviceId: string,
  vrf: string,
  destinationIp: string,
): RouteModel | undefined {
  const matching = routes.filter((r) => {
    const routeVrf = r.vrf ?? 'default';
    return r.deviceId === deviceId && routeVrf === vrf && prefixContainsIp(r.destinationPrefix, destinationIp);
  });

  if (matching.length === 0) {
    return undefined;
  }

  const protocolRank = (proto: RouteModel['protocol']): number => {
    switch (proto) {
      case 'connected':
        return 0;
      case 'aws-route-table':
        return 1;
      case 'static':
        return 2;
    }
  };

  matching.sort((a, b) => {
    const lenDiff = getPrefixLength(b.destinationPrefix) - getPrefixLength(a.destinationPrefix);
    if (lenDiff !== 0) return lenDiff;

    const adA = a.administrativeDistance ?? (a.protocol === 'connected' ? 0 : 1);
    const adB = b.administrativeDistance ?? (b.protocol === 'connected' ? 0 : 1);
    if (adA !== adB) return adA - adB;

    const rankDiff = protocolRank(a.protocol) - protocolRank(b.protocol);
    if (rankDiff !== 0) return rankDiff;

    return a.id.localeCompare(b.id);
  });

  return matching[0];
}
