const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error("invalid username");
  }
  return `${normalized}@nido-lactancia.local`;
}
