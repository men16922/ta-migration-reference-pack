import type { NetworkSnapshot, TopologyDocument } from './types';

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(canonicalizeValue);
    // Sort arrays of objects that have a stable `id` field
    if (
      mapped.length > 1 &&
      mapped.every(
        (item) => typeof item === 'object' && item !== null && 'id' in item && typeof (item as { id: unknown }).id === 'string',
      )
    ) {
      return [...mapped].sort((a, b) =>
        ((a as { id: string }).id).localeCompare((b as { id: string }).id),
      );
    }
    if (mapped.length > 1 && mapped.every((item) => typeof item === 'number')) {
      return [...(mapped as number[])].sort((a, b) => a - b);
    }
    if (mapped.length > 1 && mapped.every((item) => typeof item === 'string')) {
      return [...(mapped as string[])].sort((a, b) => a.localeCompare(b));
    }
    return mapped;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    const sortedObj: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      sortedObj[k] = canonicalizeValue(v);
    }
    return sortedObj;
  }

  return value;
}

/**
 * Produces a canonical JSON string of ONLY the semantic NetworkSnapshot.
 * Visual coordinates (`ViewAnnotations`) are never included.
 */
export function canonicalSemanticJson(snapshot: NetworkSnapshot): string {
  return JSON.stringify(canonicalizeValue(snapshot));
}

/**
 * Deterministic 64-bit FNV-1a hex digest of the canonical semantic snapshot.
 * Fast, synchronous, zero-dependency, works identically in browser and Node/Vitest.
 */
export function computeSemanticHash(snapshot: NetworkSnapshot): string {
  const canonical = canonicalSemanticJson(snapshot);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;

  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }

  return `sem-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function serializeTopologyDocument(doc: TopologyDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function deserializeTopologyDocument(rawJson: string): TopologyDocument {
  const parsed = JSON.parse(rawJson) as TopologyDocument;
  if (!parsed || typeof parsed !== 'object' || !parsed.semantic || !parsed.semantic.id) {
    throw new Error('Invalid TopologyDocument JSON: missing semantic snapshot');
  }
  return parsed;
}
