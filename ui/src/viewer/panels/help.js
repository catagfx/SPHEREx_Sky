import { $ } from '../dom';
import { openModal, closeModal } from '../ui/modal';
import { closeDropdowns } from '../ui/header';

// "How this was made" (#how): Tools ▸ How this was made, and the hero's "Methodology & Limits" link (#hw3).

export function initHelp() {
  $('#hw').onclick = $('#hw3').onclick = () => {
    openModal($('#how'), $('#hw2'));
    closeDropdowns();
    $('#hx').focus();
  };
  $('#hx').onclick = () => closeModal($('#how'), $('#hw2'));
}
