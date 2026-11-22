// Settings: the old settings panel items that still apply, each switched on/off by the admin's settingsPanel
// config. Admin-only items are a read-only summary behind "Staff info" (they are edited in /admin now).
import type { ReactNode } from 'react';
import { Keyboard, Mic, PartyPopper } from 'lucide-react';
import type { UiMode } from '@/shared/config';
import { useApp, useController } from '../context';
import { settingOn } from '../state/uiConfig';
import { actionLook } from '../actions';
import { openVoiceDiag } from './VoiceDiagHost';

const MODES: { id: UiMode; label: string; desc: string }[] = [
  { id: 'calm', label: 'Just talk', desc: 'Talk out loud. No words on the screen.' },
  { id: 'chat', label: 'Chat', desc: 'Type messages to Happi too.' },
  { id: 'call_debug', label: 'Staff view', desc: 'For staff: live transcripts and action details.' },
];

const VISIBILITY_TEXT: Record<string, string> = {
  off: 'never shown',
  call_debug_only: 'staff view only',
  chat_only: 'chat only',
  chat_and_call_debug: 'chat and staff view',
};

export function SettingsPanel() {
  const c = useController();
  const s = useApp((st) => ({
    ui: st.ui,
    uiMode: st.uiMode,
    staffTranscripts: st.staffTranscripts,
    commandMode: st.commandMode,
    allowUserTriggers: st.allowUserTriggers,
    isDesktop: st.isDesktop,
    voiceMode: st.ui.voiceMode.enabled,
    tapToTalk: st.prefs.tapToTalk ?? !st.ui.voiceMode.holdToTalk,
    spokenReplies: st.prefs.spokenReplies ?? st.ui.voiceMode.spokenReplies,
  }));
  const on = (id: string) => settingOn(s.ui, id);
  const anyAdmin = Object.keys(s.ui.settingsItems).some((k) => k.startsWith('admin_') && on(k))
    || !Object.keys(s.ui.settingsItems).length;

  return (
    <div className="cb-settings">
      {on('experience_mode') && (
        <Group title="How do you want to talk?">
          <div className="cb-radio-cards" role="radiogroup" aria-label="How do you want to talk?">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={s.uiMode === m.id} className="cb-radio-card" onClick={() => c.setUiMode(m.id)}>
                <span className="cb-radio-card-title">{m.label}</span>
                <span className="cb-radio-card-desc">{m.desc}</span>
              </button>
            ))}
          </div>
          {s.uiMode === 'call_debug' && on('call_transcripts_toggle') && (
            <Switch
              label="Show call transcripts"
              desc="Even when the admin setting hides them."
              checked={s.staffTranscripts}
              onChange={(v) => c.setStaffTranscripts(v)}
            />
          )}
        </Group>
      )}

      {s.voiceMode && (
        <Group title="Talking to Happi">
          <Switch
            label="Tap to talk"
            desc="Tap the talk button once to start and once to stop, instead of holding it."
            checked={s.tapToTalk}
            onChange={(v) => c.voiceUi.setTapToTalk(v)}
          />
          <Switch
            label="Happi answers out loud"
            desc="She says a few happy words back when you ask for something."
            checked={s.spokenReplies}
            onChange={(v) => c.voiceUi.setSpokenReplies(v)}
          />
          <p className="cb-settings-note">Your browser turns your words into text (Chrome uses Google’s speech service, Safari uses Apple’s). Happi only listens while the talk button is white.</p>
          {/* voice-4: for grown-ups / testers when the mic doesn't hear: what this phone's browser actually does */}
          <button type="button" className="cb-settings-link" onClick={() => openVoiceDiag()}>
            <Mic aria-hidden="true" size={16} /> Mic check
          </button>
        </Group>
      )}

      {(on('user_triggers') || on('input_mode')) && (
        <Group title="Actions">
          {on('user_triggers') && (
            <Switch
              label="My words can start actions"
              desc="When you type or say a magic word, it plays too."
              checked={s.allowUserTriggers}
              onChange={(v) => c.setAllowUserTriggers(v)}
            />
          )}
          {on('input_mode') && (
            <Switch
              label="Typing plays the action straight away"
              desc="For staff: type an action word to play it."
              checked={s.commandMode}
              onChange={(v) => c.setCommandMode(v)}
            />
          )}
        </Group>
      )}

      {on('trigger_keywords') && (
        <Group title="Magic words">
          <p className="cb-panel-lead">When Happi says one of these, something happens.</p>
          <ul className="cb-wordchips">
            {s.ui.keywords.map((k) => {
              const look = actionLook(k);
              return <li key={k}><look.icon aria-hidden="true" size={14} />{look.label}</li>;
            })}
          </ul>
        </Group>
      )}

      <Group title="More">
        {s.ui.welcome.enabled && (
          <button type="button" className="cb-btn is-soft is-wide" onClick={() => c.showWelcomeAgain()}>
            <PartyPopper aria-hidden="true" size={20} /> Show the welcome again
          </button>
        )}
        {s.isDesktop && s.ui.show.keyboardHelp && (
          <button type="button" className="cb-btn is-soft is-wide" onClick={() => c.openOverlay('keys')}>
            <Keyboard aria-hidden="true" size={20} /> Keyboard shortcuts
          </button>
        )}
      </Group>

      {anyAdmin && (
        <details className="cb-staffinfo">
          <summary>Staff info</summary>
          <dl>
            {on('admin_transcript_visibility') && <Row k="Call transcripts" v={VISIBILITY_TEXT[s.ui.transcriptVisibility] ?? s.ui.transcriptVisibility} />}
            {on('admin_intent_engine') && <Row k="Word matching" v={s.ui.staff.intentEngine} />}
            {on('admin_trigger_policy') && <Row k="Trigger policy" v={`${(s.ui.staff.cooldownMs / 1000).toFixed(1)} s cooldown, ${s.ui.staff.dispatchMode.replace('_', ' ')}${s.ui.staff.partialTriggers ? ', partials on' : ''}`} />}
            {on('admin_sms_policy') && <Row k="Messages to Happi" v={`typed ${s.ui.staff.smsTyped ? 'on' : 'off'}, speech ${s.ui.staff.smsSpeech ? 'on' : 'off'}`} />}
            {on('admin_allow_user_audio_to_openai') && <Row k="Caller audio transcribed" v={s.ui.staff.userAudioToOpenAI ? 'yes' : 'no'} />}
            {on('admin_english_only') && <Row k="English-only transcripts" v={s.ui.staff.englishOnly ? 'yes' : 'no'} />}
          </dl>
          <p>Change these in the <a href="/admin">admin panel</a>.</p>
        </details>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cb-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="cb-dl-row"><dt>{k}</dt><dd>{v}</dd></div>;
}

function Switch({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="cb-switch" onClick={() => onChange(!checked)}>
      <span className="cb-switch-text">
        <span className="cb-switch-label">{label}</span>
        {desc && <span className="cb-switch-desc">{desc}</span>}
      </span>
      <span className="cb-switch-track" aria-hidden="true"><span /></span>
    </button>
  );
}
