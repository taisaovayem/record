export function normalizeOperatorName(name: string): string | undefined {
  const normalized = name.trim();
  if (!normalized || Array.from(normalized).length > 255) return undefined;
  return normalized;
}
