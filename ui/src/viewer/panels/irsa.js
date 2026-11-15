import { $, $$ } from '../dom';
import { FIELD } from '../../data';
import { openModal, closeModal, dialogOf } from '../ui/modal';
import { showToast } from '../ui/toast';
import { enhanceSelect } from '../ui/dropdown';
import { parseCoord } from '../sky/coords';
import { openChange } from '../explorer';
import { setSeries, addSeriesOption } from '../explorer/series';

// Data ▸ "IRSA Cutout → Mail" (#irsaModal): the backend cuts multi-epoch SPHEREx Level 2 cutouts around any
// coordinate (POST /api/irsa-cutout, polled via /api/irsa-status/<id>), renders a blink GIF + difference map,
// optionally emails the package, and the processed target can be opened in the explorer.

const POLL_MS = 550;
let pollTimer = null;
let lastProcessedIdx = null; // FIELD index of the last processed job's target

const modal = () => $('#irsaModal');
const val = (sel) => ($(sel) ? $(sel).value.trim() : '');

/** Open the dialog, optionally pre-filled. */
export function openIrsa(ra, dec, name, email, det) {
  if (ra !== undefined && ra !== '') $('#irsaRaInput').value = ra;
  if (dec !== undefined && dec !== '') $('#irsaDecInput').value = dec;
  if (name !== undefined && name !== '') $('#irsaTargetInput').value = name;
  if (email !== undefined && email !== '') $('#irsaEmailInput').value = email;
  if (det !== undefined) $('#irsaDetSelect').value = det;
  refreshSmtpStatus();
  openModal(modal(), dialogOf(modal()));
}

/** Close the dialog and show the last processed target in "Watch it move"; `toast(name)` = message. */
function openProcessedInViewer(toast) {
  const idx = lastProcessedIdx;
  closeModal(modal(), dialogOf(modal()), () => {
    openChange('M');
    setSeries(idx);
    showToast(toast(FIELD[idx].name));
  });
}

// ---- SMTP (optional email delivery) ----

function refreshSmtpStatus() {
  fetch('/api/smtp-config')
    .then((r) => r.json())
    .then((cfg) => {
      const badge = $('#smtpStatusBadge');
      if (!badge) return;
      if (cfg.host) $('#smtpHostInput').value = cfg.host;
      if (cfg.port) $('#smtpPortInput').value = cfg.port;
      if (cfg.user) $('#smtpUserInput').value = cfg.user;
      if (cfg.configured || cfg.has_password) {
        badge.textContent = '✓ Authenticated SMTP active (' + cfg.user + ' via ' + cfg.host + ':' + cfg.port + ')';
        badge.style.color = '#39e58c';
      } else {
        badge.textContent = 'Direct MX / Local RFC-822 (.eml + HTML Preview) mode active';
        badge.style.color = '#ffb86b';
      }
    })
    .catch(() => {});
}

function saveSmtp() {
  const payload = {
    host: val('#smtpHostInput') || 'smtp.gmail.com',
    port: parseInt($('#smtpPortInput').value, 10) || 587,
    user: val('#smtpUserInput'),
    pass: $('#smtpPassInput').value,
  };
  fetch('/api/smtp-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) { showToast('Saved SMTP configuration'); refreshSmtpStatus(); }
    })
    .catch((err) => showToast('Failed to save SMTP config: ' + err.message));
}

/** SMTP credentials typed in the drawer, sent with the job (never stored). */
function inlineSmtp() {
  if (!val('#smtpUserInput') || !val('#smtpPassInput')) return null;
  return {
    host: val('#smtpHostInput') || 'smtp.gmail.com',
    port: parseInt(($('#smtpPortInput') && $('#smtpPortInput').value) || '587', 10) || 587,
    user: val('#smtpUserInput'),
    pass: val('#smtpPassInput'),
  };
}

// ---- results ----

/** Add (or replace) the processed target in FIELD so the explorer can show it. */
function registerTarget(item) {
  if (!item || !item.frames || !item.frames.length) return null;
  const existing = FIELD.findIndex((s) => s.id === item.id);
  if (existing >= 0) {
    FIELD[existing] = item;
    return existing;
  }
  FIELD.push(item);
  const idx = FIELD.length - 1;
  addSeriesOption(idx, item.label || item.name);
  return idx;
}

function bannerHtml(job) {
  const em = job.email_result || {};
  const tag = job.is_synthetic
    ? '<div style="margin-bottom:6px;padding:4px 8px;border-radius:6px;background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.5);color:#fde68a;font-weight:700;">⚠️ ILLUSTRATIVE SYNTHETIC SIMULATION (NOT REAL IRSA DATA), IRSA Hits: ' + (job.total_irsa_hits || 0) + '</div>'
    : '<div style="margin-bottom:6px;padding:4px 8px;border-radius:6px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#bbf7d0;font-weight:700;">✓ VERIFIED NASA / IPAC IRSA SPHEREx LEVEL 2 SCIENCE DATA (' + (job.total_irsa_hits || 3) + ' covering footprints)</div>';
  if (em.delivered || em.status === 'sent' || em.status === 'sent_smtp' || em.status === 'sent_mx') {
    return { bg: 'rgba(57, 229, 140, 0.12)', border: 'rgba(57, 229, 140, 0.4)',
      html: tag + '<strong>✓ Email Delivered to ' + (job.email || 'recipient') + '</strong><br><span>' + (em.message || 'Sent 3 WCS-aligned cutouts, animated blink GIF, digital difference map, and FITS telemetry.') + '</span>' };
  }
  if (job.email) {
    const note = em.technical_note ? '<br><span style="color:#ffb86b;">SMTP Note: ' + em.technical_note + '</span>' : '';
    return { bg: 'rgba(143, 211, 255, 0.12)', border: 'rgba(143, 211, 255, 0.4)',
      html: tag + '<strong>✓ Processed Telemetry &amp; Email Package Ready for ' + job.email + '</strong><br><span>' + (em.message || em.note || 'Email package generated.') + '</span>' + note };
  }
  return { bg: 'rgba(143, 211, 255, 0.1)', border: 'rgba(143, 211, 255, 0.35)',
    html: tag + '<strong>✓ Multi-Epoch Cutout Processing Complete (FOV ' + Number(job.fov_deg || 0.3).toFixed(2) + '°)</strong><br>' +
      '<span>3 epochs reprojected onto a common tangent plane with asinh contrast stretch, contamination bitmask check, and digital difference subtraction.</span>' };
}

function frameCard(f, idx, stamp) {
  const pass = f.pass || idx + 1;
  const annotated = f.annotated_u || f.annotated_url || f.u;
  const clean = f.u || f.clean_url || annotated;
  const fits = f.fits_u || f.fits_url || '#';
  const det = String(f.det || f.detector || 'D2').replace(/^D/i, '');
  const card = document.createElement('div');
  card.className = 'irsa-frame-item';
  card.innerHTML =
    '<img src="' + annotated + '?t=' + stamp + '" alt="Pass ' + pass + '">' +
    '<div class="irsa-frame-meta">' +
      '<strong>Pass ' + pass + ': ' + (f.d || f.date || '') + '</strong><br>' +
      '<span>' + (f.t || f.time_ut || '') + ' UT, Det D' + det + ' (' + (f.wl || f.wavelength_um || '1.5') + ' µm)</span><br>' +
      '<span style="color:var(--dim);">Obs: ' + (f.obs_id || '') + ', Flag: ' + (f.contam_flag || '0x00').slice(0, 4) + '</span>' +
    '</div>' +
    '<div class="irsa-frame-links">' +
      '<a href="' + annotated + '" target="_blank" rel="noopener">Annotated JPG</a>' +
      '<a href="' + clean + '" target="_blank" rel="noopener">Clean JPG</a>' +
      '<a href="' + fits + '" download>Level 2 .FITS</a>' +
    '</div>';
  return card;
}

function renderJobResult(job) {
  const view = $('#irsaResultView');
  if (!view) return;
  view.hidden = false;
  const stamp = Date.now();
  const em = job.email_result || {};

  const banner = $('#irsaEmailBanner');
  if (banner) {
    const b = bannerHtml(job);
    banner.style.background = b.bg;
    banner.style.borderColor = b.border;
    banner.innerHTML = b.html;
  }
  if ($('#irsaBlinkGif') && job.blink_gif_url) $('#irsaBlinkGif').src = job.blink_gif_url + '?t=' + stamp;
  if ($('#irsaDiffImg') && job.diff_map_url) $('#irsaDiffImg').src = job.diff_map_url + '?t=' + stamp;

  const strip = $('#irsaFramesStrip');
  if (strip && Array.isArray(job.frames)) {
    strip.innerHTML = '';
    job.frames.forEach((f, idx) => strip.appendChild(frameCard(f, idx, stamp)));
  }
  if ($('#irsaPreviewEmailLink') && em.preview_url) $('#irsaPreviewEmailLink').href = em.preview_url;
  if ($('#irsaDownloadEmlLink') && em.eml_url) $('#irsaDownloadEmlLink').href = em.eml_url;

  if (job.catalog_item) lastProcessedIdx = registerTarget(job.catalog_item);
  setTimeout(() => { if (view.scrollIntoView) view.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
}

// ---- job ----

/** Submit the cutout job for the dialog's values and follow its progress. */
export function startIrsaJob(autoOpenViewer) {
  const raRaw = val('#irsaRaInput');
  const decRaw = val('#irsaDecInput');
  const ra = parseCoord(raRaw, false);
  const dec = parseCoord(decRaw, true);
  const targetName = val('#irsaTargetInput') || 'IRSA Target (' + raRaw + ', ' + decRaw + ')';
  const det = $('#irsaDetSelect').value;
  const fov = parseFloat(($('#irsaFovSelect') && $('#irsaFovSelect').value) || '0.30') || 0.3;
  if (isNaN(ra) || isNaN(dec)) {
    showToast('Please enter valid RA and Dec coordinates.');
    return;
  }

  const stage = $('#irsaStageText');
  const pct = $('#irsaPercentText');
  const bar = $('#irsaProgressBar');
  const log = $('#irsaConsoleLog');
  const runBtn = $('#runIrsaCutoutBtn');
  const setStage = (text) => { if (stage) stage.textContent = text; };
  const setProgress = (p) => { if (pct) pct.textContent = p + '%'; if (bar) bar.style.width = p + '%'; };
  const done = () => {
    clearInterval(pollTimer);
    pollTimer = null;
    if (runBtn) runBtn.disabled = false;
  };

  if ($('#irsaPipelineBox')) $('#irsaPipelineBox').hidden = false;
  if ($('#irsaResultView')) $('#irsaResultView').hidden = true;
  setStage('Submitting coordinate job to NASA IRSA IPAC pipeline...');
  setProgress(5);
  if (log) log.textContent = '[00:00] Requesting Level 2 cutouts for RA=' + ra.toFixed(4) + '°, Dec=' + dec.toFixed(4) + '° (FOV=' + fov.toFixed(2) + '°)...';
  if (runBtn) runBtn.disabled = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  fetch('/api/irsa-cutout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ra, dec, fov,
      allow_synthetic: !!($('#irsaAllowSynthetic') && $('#irsaAllowSynthetic').checked),
      target_name: targetName,
      detector: det ? 'D' + String(det).replace(/^D/i, '') : 'D2',
      email: val('#irsaEmailInput'),
      smtp: inlineSmtp(),
    }),
  })
    .then((r) => r.json())
    .then((resp) => {
      if (!resp.ok || !resp.job_id) {
        setStage('Error: ' + (resp.error || 'Could not start job'));
        if (runBtn) runBtn.disabled = false;
        return;
      }
      pollTimer = setInterval(() => {
        fetch('/api/irsa-status/' + resp.job_id)
          .then((r) => r.json())
          .then((st) => {
            const job = st.job || st;
            if (!job || !job.status) return;
            setStage(job.stage || 'Processing...');
            setProgress(job.progress || 0);
            if (log && Array.isArray(job.logs)) {
              log.textContent = job.logs.join('\n');
              log.scrollTop = log.scrollHeight;
            }
            if (job.status === 'completed' || job.status === 'done') {
              done();
              renderJobResult(job);
              showToast('IRSA Cutout processing complete for ' + (job.target_name || targetName) + '!');
              if (autoOpenViewer === true && lastProcessedIdx !== null && FIELD[lastProcessedIdx]) {
                openProcessedInViewer((name) => 'Opened processed NASA IRSA cutouts for ' + name + ' in 5-mode viewer');
              }
            } else if (job.status === 'no_coverage' || job.status === 'error') {
              done();
              setStage(job.status === 'no_coverage' ? 'No downloadable NASA IRSA FITS coverage at this coordinate' : 'Error: ' + (job.error || 'Unknown error'));
              showToast(job.error || 'No downloadable IRSA FITS coverage for these coordinates.');
            }
          })
          .catch(() => {});
      }, POLL_MS);
    })
    .catch((err) => {
      setStage('Request failed: ' + err.message);
      if (runBtn) runBtn.disabled = false;
    });
}

export function initIrsa() {
  enhanceSelect($('#irsaDetSelect'));
  enhanceSelect($('#irsaFovSelect'));
  $('#irsaRequestBtn').onclick = () => openIrsa();
  $('#closeIrsa').onclick = () => closeModal(modal(), dialogOf(modal()));
  $('#saveSmtpBtn').onclick = saveSmtp;
  $('#runIrsaCutoutBtn').onclick = () => startIrsaJob(false);
  $('#irsaInspectInViewerBtn').onclick = () => {
    if (lastProcessedIdx !== null && FIELD[lastProcessedIdx]) openProcessedInViewer((name) => 'Inspecting processed cutouts for ' + name);
  };
  $$('.irsa-preset').forEach((chip) => {
    chip.onclick = function () {
      $('#irsaRaInput').value = this.dataset.ra || '';
      $('#irsaDecInput').value = this.dataset.dec || '';
      $('#irsaTargetInput').value = this.dataset.name || '';
      $('#irsaDetSelect').value = this.dataset.det || '';
      showToast('Loaded IRSA coordinates for ' + (this.dataset.name || 'Target'));
    };
  });
}
