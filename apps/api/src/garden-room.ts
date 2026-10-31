import { DurableObject } from 'cloudflare:workers';
import type { Rooms } from './lib/rooms';

/** Header the Worker sets (after checking the session) to tag a socket with its member. */
const MEMBER = 'x-plantpal-member';

/**
 * One room per shared garden. Sockets use the hibernation API, so an idle room costs nothing;
 * "ping" is answered without waking it. Messages are tiny change notices, never garden data.
 */
export class GardenRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    const member = req.headers.get(MEMBER) ?? '';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, member ? [member] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  changed(seq: number) {
    const msg = JSON.stringify({ type: 'changed', seq });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* closing; the member reconnects and pulls */
      }
    }
  }

  kick(member: string) {
    for (const ws of this.ctx.getWebSockets(member)) ws.close(4003, 'Access removed');
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }
}

export class DurableRooms implements Rooms {
  constructor(private readonly ns: DurableObjectNamespace<GardenRoom>) {}
  private room(workspaceId: string) {
    return this.ns.get(this.ns.idFromName(workspaceId));
  }
  async connect(workspaceId: string, userId: string, req: Request) {
    // Only the Worker decides who the member is; a client-sent header is replaced.
    const headers = new Headers(req.headers);
    headers.set(MEMBER, userId);
    return this.room(workspaceId).fetch(new Request(req.url, { headers }));
  }
  async changed(workspaceId: string, seq: number) {
    await this.room(workspaceId).changed(seq);
  }
  async kick(workspaceId: string, userId: string) {
    await this.room(workspaceId).kick(userId);
  }
}
