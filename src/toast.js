// toast.js — Shared toast notification utility

export function showToast(message, duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  if (duration) {
    setTimeout(() => toast.classList.remove('visible'), duration);
  }
}

export function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('visible');
}
