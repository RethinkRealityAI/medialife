// Voice: a real-time voice agent (ElevenLabs Agents) that plays Spark. The agent has four scene tools
// (act, look_around, set_color, remember) which the page implements; the character brief lives on the agent,
// not in this file. The agent is public (no key in the page): it is capped on the ElevenLabs side at 100
// conversations a day and 3 at once, and each visit here is capped by Spark's "energy".
// Before any client work: switch the agent to signed URLs from a Netlify function (key in Netlify env).
import { Conversation } from './vendor/elevenlabs-client.js';

export const AGENT_ID = 'agent_0701m7gq4ggrebmsks9rvx625jf3';
export const ENERGY_S = 180;          // one visit's talk time; Spark gets sleepy and goes back into the print

export function createVoice({ tools, onState, onCaption, onEnergy, getVars }) {
  let conv = null, state = 'off', startedAt = 0, warned = false, timer = null, lastEventAt = 0;
  const set = (s, detail) => { state = s; onState && onState(s, detail); };

  async function start({ textOnly = false } = {}) {
    if (conv || state === 'connecting') return;
    set('connecting');
    const vars = getVars();
    const base = {
      agentId: AGENT_ID,
      dynamicVariables: vars,
      clientTools: tools,
      // NOTE: the SDK calls onConnect INSIDE startSession(), before it resolves, so `conv` is still null here.
      // The greeting and the energy timer are started after startSession() returns (below).
      onConnect: () => { startedAt = performance.now(); warned = false; set('listening'); },
      onDisconnect: (d) => { cleanup(); set('off', d && d.reason); },
      onError: (msg) => { console.warn('voice error', msg); onCaption && onCaption('system', 'Voice hit a snag. Tap the mic to try again.'); },
      onModeChange: ({ mode }) => { if (conv) set(mode === 'speaking' ? 'speaking' : 'listening'); },
      onMessage: ({ message, source }) => { if (message && !/^\[.*\]$/.test(message.trim())) onCaption && onCaption(source === 'ai' ? 'spark' : 'you', message); },
    };
    const attempts = textOnly
      ? [{ ...base, connectionType: 'websocket', textOnly: true, overrides: { conversation: { textOnly: true } } }]
      : [{ ...base, connectionType: 'webrtc' }, { ...base, connectionType: 'websocket' }];
    let err = null;
    for (const opt of attempts) {
      try { conv = await Conversation.startSession(opt); err = null; break; } catch (e) { err = e; conv = null; }
    }
    if (conv) {
      if (!startedAt) startedAt = performance.now();
      if (state === 'connecting') set('listening');
      // the agent has no first line of its own: the scan is what starts the conversation
      try { conv.sendUserMessage('[The fan just pointed their phone at the print and you climbed out. Say hello.]'); } catch (e) { /* not ready */ }
      timer = setInterval(energyTick, 500);
    }
    if (err) {
      cleanup();
      const denied = /denied|NotAllowed|Permission/i.test(String(err && (err.name || err.message)));
      set('off', denied ? 'mic-denied' : 'failed');
      onCaption && onCaption('system', denied ? 'Spark needs the microphone to hear you. Allow it in your browser settings, then tap the mic.' : 'Spark could not connect. Check your connection and tap the mic again.');
      console.warn('voice start', err);
    }
  }

  function energyTick() {
    if (!conv) return;
    const used = (performance.now() - startedAt) / 1000, left = Math.max(0, 1 - used / ENERGY_S);
    onEnergy && onEnergy(left);
    if (!warned && used > ENERGY_S - 20) { warned = true; try { conv.sendContextualUpdate('[You are running out of energy for this visit. Say a short goodbye now and call act with sleep.]'); } catch (e) { /* closed */ } }
    if (used >= ENERGY_S) stop();
  }
  function cleanup() { if (timer) { clearInterval(timer); timer = null; } conv = null; startedAt = 0; }
  async function stop() { const c = conv; cleanup(); if (c) { try { await c.endSession(); } catch (e) { /* already closed */ } } set('off', 'ended'); }

  return {
    start, stop,
    get state() { return state; },
    get active() { return !!conv; },
    // 0..1 loudness of Spark's voice (mouth) and of the fan (listening glow)
    outLevel() { try { return conv ? conv.getOutputVolume() : 0; } catch (e) { return 0; } },
    inLevel() { try { return conv ? conv.getInputVolume() : 0; } catch (e) { return 0; } },
    // scene events the character should react to out loud (rate limited so it never nags)
    event(text, gapMs = 15000) {
      const now = performance.now(); if (!conv || now - lastEventAt < gapMs) return false;
      lastEventAt = now; try { conv.sendUserMessage(`[${text}]`); return true; } catch (e) { return false; }
    },
    type(text) { if (conv && text) { try { conv.sendUserMessage(text); onCaption && onCaption('you', text); } catch (e) { /* closed */ } } },
  };
}
