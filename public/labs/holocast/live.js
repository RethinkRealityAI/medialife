// MEDIALIFE Holocast: the control room's camera, live in the hologram.
//
// WebRTC, one peer connection per phone watching, the control room as the hub (fine for a handful of phones).
// Signalling rides the room API (/api/holocast/<CODE>/rtc), polled, without trickle ICE: every side waits for
// its ICE candidates and sends one complete SDP, so a viewer needs just join -> offer -> answer.
//
// When a phone can't reach the control room directly (strict mobile NAT and no TURN server on the site),
// it asks for the relay instead: the control room then posts a small JPEG ~2x a second and the phone shows
// those (no sound). Setting TURN on the site (see server.ts) makes the relay unnecessary.

const FORCE_RELAY = new URLSearchParams(location.search).has('relay');   // testing: skip WebRTC
// testing: a viewer whose direct connection can never succeed (what a phone on mobile data sees without TURN)
const NO_P2P = new URLSearchParams(location.search).has('nop2p');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve when ICE gathering is complete (or after `ms`, with whatever was gathered by then). */
function iceDone(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); res(); }
    function chk() { if (pc.iceGatheringState === 'complete') done(); }
    pc.addEventListener('icegatheringstatechange', chk);
  });
}

export const canStream = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// ---------------------------------------------------------------- the control room side
export class LiveHost {
  constructor(room, video, { onStatus } = {}) {
    this.room = room; this.video = video; this.onStatus = onStatus || (() => {});
    this.stream = null; this.peers = new Map(); this.after = 0; this.ice = null; this.stopped = true;
    this.relayUntil = 0; this.relayers = new Map();
    this.canvas = document.createElement('canvas');
  }
  async start(liveId, stream) {
    this.live = liveId; this.stream = stream; this.stopped = false;
    try { const j = await this.room.rtcGet('host', 0, true); this.ice = j.ice; this.after = j.seq || 0; } catch (e) { this.ice = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    // anyone already waiting (their join may be older than our first read) re-joins when they see the new id
    this.loop(); this.relayLoop();
  }
  setStream(stream) {   // camera flipped: swap the tracks on every live connection, no renegotiation
    this.stream = stream;
    for (const p of this.peers.values()) for (const s of p.pc.getSenders()) {
      const t = stream.getTracks().find((x) => s.track && x.kind === s.track.kind);
      if (t) s.replaceTrack(t).catch(() => {});
    }
  }
  stop() {
    this.stopped = true;
    for (const p of this.peers.values()) try { p.pc.close(); } catch (e) { /* closed */ }
    this.peers.clear(); this.status();
  }
  status() {
    let on = 0; for (const p of this.peers.values()) if (p.pc.connectionState === 'connected') on++;
    const now = Date.now(); let relay = 0; for (const [sid, t] of this.relayers) { if (now - t < 15000) relay++; else this.relayers.delete(sid); }
    this.onStatus({ peers: on, relay });
  }
  async loop() {
    while (!this.stopped) {
      if (!document.hidden) {
        try {
          const j = await this.room.rtcGet('host', this.after);
          for (const m of j.msgs) { this.after = Math.max(this.after, m.n); if (m.live === this.live) await this.handle(m); }
        } catch (e) { /* try again */ }
      }
      this.status();
      await sleep(1000);
    }
  }
  async handle(m) {
    if (m.kind === 'join') return this.offerTo(m.from);
    if (m.kind === 'answer') { const p = this.peers.get(m.from); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => {}); return; }
    if (m.kind === 'relay') { this.relayUntil = Date.now() + 15000; this.relayers.set(m.from, Date.now()); return; }
    if (m.kind === 'leave') { const p = this.peers.get(m.from); if (p) { try { p.pc.close(); } catch (e) { /* closed */ } this.peers.delete(m.from); } }
  }
  async offerTo(sid) {
    const old = this.peers.get(sid); if (old) try { old.pc.close(); } catch (e) { /* closed */ }
    const pc = new RTCPeerConnection({ iceServers: this.ice || [] });
    this.peers.set(sid, { pc, at: Date.now() });
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (this.peers.get(sid) && this.peers.get(sid).pc === pc) this.peers.delete(sid); }
      this.status();
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc);
      // keep the uplink sane with several phones watching
      for (const s of pc.getSenders()) if (s.track && s.track.kind === 'video') {
        const p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 1_200_000; s.setParameters(p).catch(() => {});
      }
      await this.room.rtcPost({ kind: 'offer', to: sid, live: this.live, sdp: pc.localDescription.sdp });
    } catch (e) { try { pc.close(); } catch (er) { /* closed */ } this.peers.delete(sid); }
  }
  // the relay: a small JPEG ~2x a second while any phone asked for it in the last 15 s
  async relayLoop() {
    while (!this.stopped) {
      const v = this.video;
      if (Date.now() < this.relayUntil && v && v.videoWidth && !document.hidden) {
        const w = 560, h = Math.round(w * v.videoHeight / v.videoWidth);
        this.canvas.width = w; this.canvas.height = h;
        this.canvas.getContext('2d').drawImage(v, 0, 0, w, h);
        const blob = await new Promise((r) => this.canvas.toBlob(r, 'image/jpeg', 0.6));
        if (blob) await this.room.sendFrame(blob).catch(() => {});
        await sleep(150);
      } else await sleep(600);
    }
  }
}

// ---------------------------------------------------------------- the hologram side
export class LiveViewer {
  constructor(room, { onStream, onFrame, onState } = {}) {
    this.room = room; this.onStream = onStream || (() => {}); this.onFrame = onFrame || (() => {}); this.onState = onState || (() => {});
    this.pc = null; this.stopped = true; this.state = 'idle';
  }
  set(s) { if (this.state !== s) { this.state = s; this.onState(s); } }
  async start(liveId) {
    this.stop(true);
    const run = this.run = {};
    this.live = liveId; this.stopped = false; this.after = 0; this.set('connecting');
    const sid = this.room.sid;
    try { const j = await this.room.rtcGet(sid, 0, true); this.ice = j.ice; this.after = j.seq || 0; } catch (e) { this.ice = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    if (this.run !== run) return;
    if (FORCE_RELAY) return this.relay(liveId, run);
    const t0 = Date.now(); let joinAt = 0, answeredAt = 0;
    while (this.run === run && this.state !== 'live' && this.state !== 'relay') {
      const now = Date.now();
      if (!answeredAt && now - joinAt > 6000) { joinAt = now; await this.room.rtcPost({ kind: 'join', from: sid, live: liveId }); }
      try {
        const j = await this.room.rtcGet(sid, this.after);
        for (const m of j.msgs) { this.after = Math.max(this.after, m.n); if (m.kind === 'offer' && m.live === liveId) { answeredAt = Date.now(); await this.answer(m.sdp, liveId); } }
      } catch (e) { /* try again */ }
      // no direct path after a while (or it failed): fall back to the relay
      const pcs = this.pc && this.pc.connectionState;
      if (pcs === 'failed' || (answeredAt && Date.now() - answeredAt > 6000 && pcs !== 'connected') || (!answeredAt && now - t0 > 20000)) { this.relay(liveId, run); break; }
      await sleep(700);
    }
  }
  async answer(sdp, liveId) {
    if (this.pc) try { this.pc.close(); } catch (e) { /* closed */ }
    const pc = this.pc = new RTCPeerConnection(NO_P2P ? { iceServers: [], iceTransportPolicy: 'relay' } : { iceServers: this.ice || [] });
    pc.ontrack = (e) => { const s = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]); this.onStream(s); };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') this.set('live');
      else if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && this.state === 'live' && !this.stopped) {
        // dropped mid-stream: try once more from the top, then the relay
        setTimeout(() => { if (pc === this.pc && pc.connectionState !== 'connected' && !this.stopped) this.start(liveId); }, pc.connectionState === 'failed' ? 0 : 4000);
      }
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc);
      await this.room.rtcPost({ kind: 'answer', from: this.room.sid, live: liveId, sdp: pc.localDescription.sdp });
    } catch (e) { /* the loop falls back to the relay */ }
  }
  async relay(liveId, run) {
    this.set('relay');
    if (this.pc) { try { this.pc.close(); } catch (e) { /* closed */ } this.pc = null; }
    let askAt = 0;
    while (this.run === run && !this.stopped) {
      if (Date.now() - askAt > 8000) { askAt = Date.now(); this.room.rtcPost({ kind: 'relay', from: this.room.sid, live: liveId }); }
      if (!document.hidden) {
        await new Promise((res) => {
          const img = new Image(); img.crossOrigin = 'anonymous';
          img.onload = () => { if (this.run === run) this.onFrame(img); res(); };
          img.onerror = () => res();
          img.src = this.room.frameUrl();
        });
      }
      await sleep(250);
    }
  }
  stop(quiet) {
    const was = !this.stopped && this.live;
    this.stopped = true; this.run = null;
    if (this.pc) { try { this.pc.close(); } catch (e) { /* closed */ } this.pc = null; }
    if (was && !quiet) this.room.rtcPost({ kind: 'leave', from: this.room.sid, live: was }).catch(() => {});
    this.set('idle');
  }
}
