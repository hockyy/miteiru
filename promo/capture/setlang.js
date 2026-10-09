(async (value) => {
  const select = document.querySelector('select');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', {bubbles: true}));
  return select.value;
})
