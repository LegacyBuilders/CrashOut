import Peer from 'peerjs';

// Casual host-authoritative P2P over WebRTC (PeerJS public broker).
// Host runs the full simulation and controls P1; the guest controls P2 by
// streaming its input; host streams authoritative snapshots back.
// This is not rollback netcode — expect smoothing, not frame-perfect sync.

export class NetSession {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.connected = false;
    this.onData = null;     // (msg) => void
    this.onOpen = null;     // () => void
    this.onClose = null;    // () => void
    this.onError = null;    // (err) => void
  }

  _wire(conn) {
    this.conn = conn;
    conn.on('open', () => { this.connected = true; this.onOpen?.(); });
    conn.on('data', (d) => this.onData?.(d));
    conn.on('close', () => { this.connected = false; this.onClose?.(); });
    conn.on('error', (e) => this.onError?.(e));
  }

  // Returns the room id others use to join.
  host() {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      const id = 'crashout-' + Math.random().toString(36).slice(2, 8);
      this.peer = new Peer(id, { debug: 1 });
      this.peer.on('open', (pid) => resolve(pid));
      this.peer.on('connection', (conn) => this._wire(conn));
      this.peer.on('error', (e) => { this.onError?.(e); reject(e); });
    });
  }

  join(hostId) {
    this.isHost = false;
    return new Promise((resolve, reject) => {
      this.peer = new Peer({ debug: 1 });
      this.peer.on('open', () => {
        const conn = this.peer.connect(hostId, { reliable: false });
        this._wire(conn);
        conn.on('open', () => resolve());
      });
      this.peer.on('error', (e) => { this.onError?.(e); reject(e); });
    });
  }

  send(msg) {
    if (this.conn && this.connected) {
      try { this.conn.send(msg); } catch (_) { /* ignore transient */ }
    }
  }

  close() {
    try { this.conn?.close(); } catch (_) {}
    try { this.peer?.destroy(); } catch (_) {}
    this.connected = false;
  }
}

// Input source fed by remote messages (used on the host for P2).
export class RemoteInput {
  constructor() {
    this.state = { left: false, right: false, up: false, down: false, punch: false, kick: false, heavy: false };
    this.pressed = { punch: false, kick: false, heavy: false, up: false };
  }
  apply(msg) {
    if (msg.down) this.state = msg.down;
    if (msg.pressed) for (const k of Object.keys(this.pressed)) this.pressed[k] = this.pressed[k] || !!msg.pressed[k];
  }
  isDown(action) { return !!this.state[action]; }
  wasPressed(action) { return !!this.pressed[action]; }
  endFrame() { this.pressed = { punch: false, kick: false, heavy: false, up: false }; }
}
