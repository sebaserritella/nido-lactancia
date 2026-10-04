const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.endsWith("@nido-lactancia.local")) {
    throw new Error("invalid email");
  }
  return email;
}
