export function slugify(text) {
  return text.toLowerCase().split(' ').join('-');
}
