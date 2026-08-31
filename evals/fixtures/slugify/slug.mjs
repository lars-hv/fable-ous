export function slugify(value) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(" ", "-");
}
