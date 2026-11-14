import { $ } from '../dom';
import { openModal, closeModal } from '../ui/modal';
import { showToast } from '../ui/toast';
import { st, series } from '../explorer/state';
import { currentFov } from '../explorer/crossmatch';

// Share ▸ "Share link" (copies a deep link to the current view) and Share ▸ "Embed" (iframe snippet dialog).

function activeCoords() {
  const s = series();
  return {
    ra: s && s.ra !== undefined ? Number(s.ra).toFixed(4) : '269.4521',
    dec: s && s.dec !== undefined ? Number(s.dec).toFixed(4) : '4.6934',
    fov: currentFov(),
  };
}

/** Id put in shared links: the selected target in mode M/C/D, else Barnard's Star. */
function sharedTargetId() {
  if (series()) return series().id;
  return 'barnard';
}

const routeHash = (id, mode, c) => '#target=' + encodeURIComponent(id) + '&ra=' + encodeURIComponent(c.ra) + '&dec=' + encodeURIComponent(c.dec) +
  '&fov=' + encodeURIComponent(c.fov) + '&mode=' + encodeURIComponent(mode);

/** Deep link that reopens a view (read by viewer/routes.js). */
export function getShareUrl(targetId, modeCode) {
  const u = new URL(window.location.href);
  u.searchParams.delete('embed');
  return u.origin + u.pathname + routeHash(targetId || 'barnard', modeCode || 'S', activeCoords());
}

function copyText(text, done, promptLabel) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => prompt(promptLabel, text));
  } else {
    prompt(promptLabel, text);
  }
}

export function initShare() {
  $('#shareBtn').onclick = () => {
    copyText(getShareUrl(sharedTargetId(), st.mode), () => showToast('Shareable coordinate link copied!'), 'Copy this shareable link:');
  };

  $('#embedBtn').onclick = () => {
    const c = activeCoords();
    const u = new URL(window.location.href);
    u.searchParams.set('embed', 'true');
    u.searchParams.set('ra', c.ra);
    u.searchParams.set('dec', c.dec);
    u.searchParams.set('fov', c.fov);
    u.hash = routeHash(sharedTargetId(), st.mode, c);
    $('#embedText').value = '<iframe src="' + u.href + '" width="100%" height="650" frameborder="0" allow="accelerometer; gyroscope; vr" style="border-radius:12px; border:1px solid rgba(255,255,255,0.2);"></iframe>';
    openModal($('#embedModal'), $('#modalBox'));
  };

  $('#copyEmbed').onclick = () => {
    const t = $('#embedText');
    t.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t.value).then(() => showToast('Embed code copied!'));
    } else {
      document.execCommand('copy');
      showToast('Embed code copied!');
    }
  };

  $('#closeEmbed').onclick = () => closeModal($('#embedModal'), $('#modalBox'));
}
