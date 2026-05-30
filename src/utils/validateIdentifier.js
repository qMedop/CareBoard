export function validateIdentifier(identifier) {
  const regex = /^[a-zA-Z0-9._@]+$/;

  if (identifier.length < 3 || identifier.length > 10) {
    return false;
  }
  return regex.test(identifier);
}
