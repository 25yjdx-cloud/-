import { createElement } from 'react';
import { getLegacyNode } from './legacyMarkup.js';

export default function SupportCard() {
  const { tagName, props, innerHTML } = getLegacyNode('#support-settings-section');
  return createElement(tagName, {
    ...props,
    dangerouslySetInnerHTML: { __html: innerHTML },
  });
}
