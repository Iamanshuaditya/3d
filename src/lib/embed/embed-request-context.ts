/**
 * Marks browser API calls as coming from an embedded configurator frame (#27).
 *
 * The server needs this to decide the guest cookie's partitioning, and the
 * frame is the only place that knows. It is set once when the embed shell
 * mounts, so every existing API call picks it up without threading a flag
 * through call sites that have no business knowing about embedding.
 */
let embedClientId: string | null = null;
let editorSession: { id: string; token: string } | null = null;

export function markEmbedContext(clientId: string, session: { id: string; token: string } | null = null) {
  embedClientId = clientId;
  editorSession = session;
}

export function clearEmbedContext() {
  embedClientId = null;
  editorSession = null;
}

export function currentEditorSessionId(): string | null {
  return editorSession?.id ?? null;
}

export function currentEmbedClientId(): string | null {
  return embedClientId;
}

export function embedRequestHeaders(): Record<string, string> {
  return {
    ...(embedClientId ? { "x-vortex-embed-client": embedClientId } : {}),
    // A missing token in a session frame must fail closed, never become an anonymous project.
    ...(editorSession ? { "x-vortex-session": editorSession.token } : {}),
  };
}
