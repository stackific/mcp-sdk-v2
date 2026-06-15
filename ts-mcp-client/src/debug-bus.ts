/**
 * Every JSON-RPC frame the MCP client sends/receives, plus lifecycle and bridge
 * events, flow through this bus. The /debug/stream SSE endpoint relays them to the
 * frontend so each capability page can show what is happening on the wire.
 */
export type FrameKind =
  | 'request'
  | 'response'
  | 'error'
  | 'notification'
  | 'lifecycle'
  | 'elicitation'
  | 'note';

export interface Frame {
  seq: number;
  ts: number;
  dir: 'send' | 'recv' | 'local';
  kind: FrameKind;
  method?: string;
  id?: string | number | null;
  summary?: string;
  payload?: unknown;
  /** Correlates frames produced while handling one frontend-triggered action. */
  trace?: string;
}

type FrameListener = (frame: Frame) => void;

/**
 * A tiny edge-safe event bus (no `node:events`). Frames fan out to every
 * registered listener; the `/debug/stream` SSE endpoint subscribes via on/off.
 */
class DebugBus {
  private seq = 0;
  private readonly listeners = new Set<FrameListener>();

  on(_event: 'frame', listener: FrameListener): this {
    this.listeners.add(listener);
    return this;
  }
  off(_event: 'frame', listener: FrameListener): this {
    this.listeners.delete(listener);
    return this;
  }
  emitFrame(f: Omit<Frame, 'seq' | 'ts'>): Frame {
    const frame: Frame = { ...f, seq: ++this.seq, ts: Date.now() };
    for (const listener of [...this.listeners]) {
      try {
        listener(frame);
      } catch {
        // a listener must not break the bus
      }
    }
    return frame;
  }
}

export const bus = new DebugBus();
