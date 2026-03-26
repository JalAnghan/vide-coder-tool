export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}
