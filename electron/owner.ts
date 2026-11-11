export function getOwnerId(): string {
  return (process.env.MIRA_OWNER_ID ?? "local").trim() || "local";
}
