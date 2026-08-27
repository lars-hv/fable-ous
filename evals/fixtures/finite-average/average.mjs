export function average(values) {
  if (!Array.isArray(values)) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
