import { $ } from '../dom';
import { isEmbed } from '../../core/env';
import { initPanel, togglePanel, openJoin } from './panel';

// Live seminars: voice rooms where the presenter moves the sky for everyone.
//   api.js      calls to the voice server (voice-server/)
//   session.js  LiveKit connection, people, hands, chat
//   skycast.js  presenter's sky: send / follow
//   panel.js    the panel (lobby, room)
// Invite links look like  https://site/#room=a3f09c1e  and open the join form.

export function initVoice() {
  if (isEmbed) return;
  initPanel();
  const btn = $('#voiceBtn');
  if (btn) { btn.hidden = false; btn.onclick = togglePanel; }

  const fromHash = () => {
    const code = new URLSearchParams(location.hash.slice(1)).get('room');
    if (code) openJoin(code.slice(0, 40));
  };
  fromHash();
  addEventListener('hashchange', fromHash);
}
