import {
  closeStore,
  ensureBootstrapSession,
  getDatabasePath,
  getStoreHealth,
  openStore,
} from "../electron/store";

openStore();
const session = ensureBootstrapSession();
const health = getStoreHealth();

console.log(
  JSON.stringify(
    {
      ok: health.ok,
      databasePath: getDatabasePath(),
      bootstrapSession: session,
      sessions: health.sessions,
      utterances: health.utterances,
    },
    null,
    2,
  ),
);

closeStore();
