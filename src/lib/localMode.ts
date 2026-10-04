let localMode = false;

export function markLocalMode() {
  localMode = true;
}

export function isLocalMode(): boolean {
  return localMode;
}
