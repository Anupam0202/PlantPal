/**
 * Live "something changed" pings for a shared garden (§14.3 realtime). Pings carry no garden data:
 * members pull, and pull checks access as always. Polling on focus is the fallback.
 */
export interface Rooms {
  /** Hands an already-authorised WebSocket upgrade to the garden's room. */
  connect(workspaceId: string, userId: string, req: Request): Promise<Response>;
  /** Tells connected members the garden changed (up to `seq`). */
  changed(workspaceId: string, seq: number): Promise<void>;
  /** Closes a removed member's live connections. */
  kick(workspaceId: string, userId: string): Promise<void>;
}

/** Records what would be sent, for tests. */
export class MemoryRooms implements Rooms {
  readonly events: Array<
    | { kind: 'connect'; workspaceId: string; userId: string }
    | { kind: 'changed'; workspaceId: string; seq: number }
    | { kind: 'kick'; workspaceId: string; userId: string }
  > = [];
  async connect(workspaceId: string, userId: string) {
    this.events.push({ kind: 'connect', workspaceId, userId });
    return new Response(null, { status: 204 });
  }
  async changed(workspaceId: string, seq: number) {
    this.events.push({ kind: 'changed', workspaceId, seq });
  }
  async kick(workspaceId: string, userId: string) {
    this.events.push({ kind: 'kick', workspaceId, userId });
  }
}
