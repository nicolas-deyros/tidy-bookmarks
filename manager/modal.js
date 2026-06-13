export function confirmModal(title, body) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const box = document.createElement('div');
    box.className = 'modal-box';
    const h = document.createElement('h3');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.textContent = 'Delete';
    confirm.className = 'danger';

    function onKey(e) { if (e.key === 'Escape') close(false); }
    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);

    actions.append(cancel, confirm);
    box.append(h, p, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    confirm.focus();
  });
}
