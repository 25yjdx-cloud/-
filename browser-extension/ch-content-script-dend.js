function showOneChild(element) {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('showOneChild expects an HTML element.');
  }

  Array.from(element.children).forEach((child, index) => {
    if (child instanceof HTMLElement) {
      child.style.display = index === 0 ? 'block' : 'none';
    }
  });
}
