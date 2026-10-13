import { createElement } from 'react';
import { getLegacyNode } from './legacyMarkup.js';

export default function LegacyMarkup({ selector, index = 0 }) {
  const { tagName, props, innerHTML } = getLegacyNode(selector, index);
  return createElement(tagName, {
    ...props,
    dangerouslySetInnerHTML: { __html: innerHTML },
  });
}
