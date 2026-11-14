import { $ } from '../dom';
import { showToast } from '../ui/toast';
import { fly } from '../sky/camera';
import { radecToGal, parseCoord } from '../sky/coords';
import { openIrsa, startIrsaJob } from '../panels/irsa';

// Story section 6 (story/sections/Citizen.tsx): point the globe at any coordinate, flag a candidate, or send
// the IRSA cutout form (prefilled into the full IRSA dialog).

const val = (sel) => ($(sel) ? $(sel).value.trim() : '');

export function initCitizenSection() {
  $('#storyCoordSearchBtn').onclick = () => {
    const ra = parseCoord($('#storyRaInput').value, false);
    const dec = parseCoord($('#storyDecInput').value, true);
    if (isNaN(ra) || isNaN(dec)) {
      showToast('Please enter valid RA and Dec values.');
      return;
    }
    const g = radecToGal(ra, dec);
    fly(['Target', g.l, g.b], 35);
    showToast('Sky globe centered on RA ' + ra.toFixed(2) + '°, Dec ' + dec.toFixed(2) + '°');
  };
  $('#storyFlagBtn').onclick = () => $('#flagAnomalyBtn').click();

  $('#storyOpenIrsaModalBtn').onclick = () => {
    openIrsa(val('#storyIrsaRa'), val('#storyIrsaDec'), val('#storyIrsaName'), val('#storyIrsaEmail'));
  };
  $('#storyIrsaSubmitBtn').onclick = () => {
    openIrsa(val('#storyIrsaRa') || '269.4521', val('#storyIrsaDec') || '4.6934', val('#storyIrsaName') || "Barnard's Star", val('#storyIrsaEmail'));
    setTimeout(() => startIrsaJob(), 250);
  };
}
