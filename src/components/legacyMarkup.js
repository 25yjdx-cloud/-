import legacyTemplate from '../legacy/legacy-template.html?raw';

const parsedTemplate = new DOMParser().parseFromString(legacyTemplate, 'text/html');

export function getLegacyNode(selector, index = 0) {
  const element = parsedTemplate.querySelectorAll(selector)[index];
  if (!element) throw new Error(`Legacy template is missing required element: ${selector}`);
  const props = {};
  for (const attribute of element.attributes) {
    if (attribute.name.startsWith('on')) continue;
    if (attribute.name === 'hidden') {
      props.hidden = true;
      continue;
    }
    const propName = ({
      class: 'className',
      for: 'htmlFor',
      tabindex: 'tabIndex',
    })[attribute.name] || attribute.name;
    props[propName] = attribute.value;
  }
  return { tagName: element.tagName.toLowerCase(), props, innerHTML: element.innerHTML };
}

export function getSettingsMarkupParts() {
  const settings = parsedTemplate.querySelector('#settings-modal');
  if (!settings) throw new Error('Legacy template is missing the settings modal.');
  const header = settings.querySelector('.modal-header');
  const body = settings.querySelector('.modal-body');
  const supportCard = body?.querySelector('#support-settings-section');
  if (!header || !body || !supportCard) {
    throw new Error('Legacy settings markup is incomplete.');
  }

  const bodyChildren = [...body.children];
  const supportIndex = bodyChildren.indexOf(supportCard);
  return {
    header: header.innerHTML,
    beforeSupport: bodyChildren.slice(0, supportIndex).map((element) => element.outerHTML).join(''),
    support: supportCard.outerHTML,
    afterSupport: bodyChildren.slice(supportIndex + 1).map((element) => element.outerHTML).join(''),
  };
}
