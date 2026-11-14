// Reusable pure-data snapshots. Callers must detach mutable inputs before
// freezing so SDK results never freeze the consumer's source objects.
export function freezeStructure(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeStructure(child, seen);
  return Object.freeze(value);
}