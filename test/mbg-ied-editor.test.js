import { html } from 'lit';
import { fixture, expect } from '@open-wc/testing';

import '../mbg-ied-editor.js';

describe('MbgIedEditor', () => {
  let element;
  beforeEach(async () => {
    element = await fixture(html`<mbg-ied-editor></mbg-ied-editor>`);
  });

  it('passes the a11y audit', async () => {
    await expect(element).shadowDom.to.be.accessible();
  });
});
