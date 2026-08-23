export function assertStorageKey(key: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,511}$/.test(key) || key.includes("..")) {
    throw new Error("Invalid object-store key.");
  }
}

export function encodeStorageKey(key: string): string {
  assertStorageKey(key);
  return key.split("/").map(encodeURIComponent).join("/");
}
