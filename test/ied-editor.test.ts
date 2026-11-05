import { html } from 'lit';
import { fixture, expect, oneEvent } from '@open-wc/testing';

import { IedEditor } from '../src/ied-editor.js';
import { lnPath } from '../src/utils/ln-model.js';
import { valuesScd } from './fixtures/values.scd.js';

if (!customElements.get('ied-editor')) {
  customElements.define('ied-editor', IedEditor);
}

type ValInput = HTMLElement & { value: string; updateComplete: Promise<void> };

// Input ids come from getInputPath(): `${ldInst}-${lnClass}${lnInst}-${DO}-${DA}${sGroup}`
const PLAIN = 'LD1-LLN0-Mod-sboTimeout';
const SG1 = 'LD1-LLN0-SetMod-setVal1';
const SG2 = 'LD1-LLN0-SetMod-setVal2';

/**
 * Renders <ied-editor> with the test SCL file and opens the LN0 and its DOs,
 * so that the value inputs are actually in the DOM.
 */
async function setup(modify?: (doc: Document) => void) {
  const doc = new DOMParser().parseFromString(valuesScd, 'application/xml');
  modify?.(doc);

  const ied = doc.querySelector('IED')!;
  const ln0 = ied.querySelector('LN0')!;

  const el = await fixture<IedEditor>(
    html`<ied-editor .doc=${doc} .ied=${ied}></ied-editor>`,
  );

  // openPaths decides which <details> are expanded.
  // Each path is the LN path plus the names of its children.
  const ln = lnPath(ln0);
  (el as unknown as { openPaths: Set<string> }).openPaths = new Set([
    ln,
    `${ln} Mod`,
    `${ln} SetMod`,
    `${ln} GrRef`,
  ]);
  await el.updateComplete;

  return { el, doc };
}

function input(el: IedEditor, id: string): ValInput {
  return el.shadowRoot!.getElementById(id) as ValInput;
}

// Material's md-icon-button moves `aria-label` to `data-aria-label` on itself
function button(el: IedEditor, label: string): HTMLElement | null {
  return el.shadowRoot!.querySelector(
    `md-icon-button[data-aria-label="${label}"]`,
  );
}

/** Simulates the user typing `text` into a value input. */
async function typeInto(el: IedEditor, id: string, text: string) {
  const valInput = input(el, id);
  await valInput.updateComplete;
  const field = valInput.shadowRoot!.querySelector(
    '#input',
  ) as HTMLInputElement;
  field.value = text;
  valInput.dispatchEvent(new Event('input'));
  await el.updateComplete;
}

describe('IedEditor values', () => {
  describe('plain value', () => {
    it('marks the input dirty when the user types', async () => {
      const { el } = await setup();

      await typeInto(el, PLAIN, '123');

      expect(input(el, PLAIN)).to.have.class('dirty');
      expect(button(el, 'Save value (unsaved changes)')).to.exist;
    });

    it('clears dirty when the user types the original value back', async () => {
      const { el } = await setup();

      await typeInto(el, PLAIN, '123');
      await typeInto(el, PLAIN, '30000');

      expect(input(el, PLAIN)).not.to.have.class('dirty');
      expect(button(el, 'Save value')).to.have.attribute('disabled');
    });

    it('dispatches the typed text on save', async () => {
      const { el, doc } = await setup();
      await typeInto(el, PLAIN, '123');

      // start listening before clicking, then wait for the event
      const event = oneEvent(el, 'oscd-edit-v2');
      button(el, 'Save value (unsaved changes)')!.click();
      const { detail } = await event;

      const val = doc.querySelector('DAI[name="sboTimeout"] > Val');
      expect(detail.edit.at(-1)).to.deep.equal({
        element: val,
        textContent: '123',
      });
    });

    it('dispatches a remove on delete', async () => {
      const { el } = await setup();

      const event = oneEvent(el, 'oscd-edit-v2');
      button(el, 'Delete value')!.click();
      const { detail } = await event;

      expect(detail.edit[0]).to.have.property('node');
      expect(detail.edit[0]).not.to.have.property('parent');
    });
  });

  describe('setting group values', () => {
    it('renders one input per existing setting group', async () => {
      const { el } = await setup();

      expect(input(el, SG1)).to.exist;
      expect(input(el, SG2)).to.exist;
    });

    it('labels only the active setting group when all SGs share one Val', async () => {
      const { el } = await setup(doc => {
        const dai = doc.querySelector('DAI[name="setVal"]')!;
        dai.querySelector('Val[sGroup="2"]')!.remove();
        dai.querySelector('Val')!.removeAttribute('sGroup');
      });

      expect(input(el, SG1)).to.have.attribute('label', 'Val 1 (actSG)');
      expect(input(el, SG2)).to.have.attribute('label', 'Val 2');
      expect(
        el.shadowRoot!.querySelectorAll(
          'md-icon-button[data-aria-label="Delete all setting group values"]',
        ),
      ).to.have.length(1);
      expect(
        button(el, 'Sync value of setting group 2 with active setting group 1'),
      ).to.have.attribute('disabled');
    });

    it('adds the missing setting group 3', async () => {
      const { el } = await setup();

      const event = oneEvent(el, 'oscd-edit-v2');
      button(el, 'Add value for setting group 3')!.click();
      const { detail } = await event;

      const inserted = detail.edit.at(-1).node as Element;
      expect(inserted.tagName).to.equal('Val');
      expect(inserted.getAttribute('sGroup')).to.equal('3');
    });

    it('syncs setting group 2 with the active setting group', async () => {
      const { el, doc } = await setup();

      const event = oneEvent(el, 'oscd-edit-v2');
      button(
        el,
        'Sync value of setting group 2 with active setting group 1',
      )!.click();
      const { detail } = await event;

      const val2 = doc.querySelector('DAI[name="setVal"] > Val[sGroup="2"]');
      expect(detail.edit.at(-1)).to.deep.equal({
        element: val2,
        textContent: 'on',
      });
    });

    it('does not modify the document directly when syncing', async () => {
      const { el, doc } = await setup();

      button(
        el,
        'Sync value of setting group 2 with active setting group 1',
      )!.click();

      const val2 = doc.querySelector('DAI[name="setVal"] > Val[sGroup="2"]');
      expect(val2!.textContent).to.equal('off');
    });

    it('saves a plain value whose Val carries an sGroup attribute', async () => {
      const { el } = await setup(doc =>
        doc
          .querySelector('DAI[name="sboTimeout"] > Val')!
          .setAttribute('sGroup', '1'),
      );

      await typeInto(el, PLAIN, '123');

      expect(button(el, 'Save value (unsaved changes)')).to.exist;
    });
  });

  describe('read-only value', () => {
    it('shows a lock instead of save and delete buttons', async () => {
      const { el } = await setup();

      const row = input(el, 'LD1-LLN0-GrRef-setSrcRef').closest(
        '.render-value-container',
      )!;

      expect(row.querySelector('.read-only-indicator')).to.exist;
      expect(row.querySelector('md-icon-button')).to.not.exist;
    });
  });
});
