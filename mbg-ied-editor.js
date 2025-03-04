import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { IedEditor } from './ied-editor.js';

import '@material/web/icon/icon.js';
import '@material/web/select/filled-select.js';
import '@material/web/select/select-option.js';

customElements.define('ied-editor', IedEditor);

function meinbergFirst(a, b) {
  if (a.toLowerCase().startsWith('meinberg')) return -1;
  if (b.toLowerCase().startsWith('meinberg')) return 1;
  return 0;
}

export default class MbgIedEditor extends LitElement {
  static properties = {
    doc: {},
    editCount: { type: Number },
  };

  get ied() {
    const selector = this.shadowRoot.querySelector('#ied-selector');
    if (!selector) return null;
    return this.doc.querySelector(`IED[name="${selector.value}"]`);
  }

  render() {
    const iedsByManufacturer = [];
    this.doc?.querySelectorAll(':root > IED').forEach(ied => {
      const manufacturer = ied.getAttribute('manufacturer');
      if (!iedsByManufacturer[manufacturer])
        iedsByManufacturer[manufacturer] = [];
      iedsByManufacturer[manufacturer].push(ied);
    });
    const manufacturers = Object.keys(iedsByManufacturer).sort(meinbergFirst);

    return html`
      <main>
        <md-filled-select
          id="ied-selector"
          label="Select IED"
          aria-labelledby="group-title"
          @change=${() => this.requestUpdate()}
        >
          ${repeat(
            manufacturers,
            manufacturer => manufacturer,
            manufacturer => html`
              <h3 id="group-title">${manufacturer}</h3>
              ${repeat(
                iedsByManufacturer[manufacturer],
                ied => ied,
                ied => html`
                  <md-select-option value="${ied.getAttribute('name')}">
                    <div slot="headline">${ied.getAttribute('name')}</div>
                  </md-select-option>
                `,
              )}
            `,
          )}
        </md-filled-select>

        ${this.ied &&
        html`<ied-editor
          .doc=${this.doc}
          .ied=${this.ied}
          .editCount=${this.editCount}
        ></ied-editor>`}
      </main>
    `;
  }

  static styles = css`
    * {
      scrollbar-color: var(--oscd-primary) var(--oscd-base3);

      --md-sys-color-surface-container-highest: var(--oscd-base3);
      --md-sys-color-surface-container: var(--oscd-base3);
      --md-sys-color-secondary-container: var(--oscd-base2);
      --md-sys-color-primary: var(--oscd-primary);
      --md-sys-color-on-surface: var(--oscd-base00);
      --md-sys-typescale-body-large-font: var(--oscd-text-font);

      --md-filled-select-text-field-active-indicator-color: var(--oscd-base0);
      --md-filled-select-text-field-active-indicator-height: 1px;
      --md-filled-select-text-field-label-text-color: var(--oscd-base1);
      --md-filled-select-text-field-input-text-color: var(--oscd-base00);
      --md-filled-select-text-field-hover-label-text-color: var(--oscd-base0);
      --md-filled-select-text-field-hover-input-text-color: var(--oscd-base01);
      --md-filled-select-text-field-focus-label-text-color: var(--oscd-primary);
      --md-filled-select-text-field-focus-input-text-color: var(--oscd-base01);

      --oscd-primary: var(--oscd-theme-primary, #2aa198);
      --oscd-secondary: var(--oscd-theme-secondary, #6c71c4);
      --oscd-error: var(--oscd-theme-error, #dc322f);

      --oscd-base03: var(--oscd-theme-base03, #002b36);
      --oscd-base02: var(--oscd-theme-base02, #073642);
      --oscd-base01: var(--oscd-theme-base01, #586e75);
      --oscd-base00: var(--oscd-theme-base00, #657b83);
      --oscd-base0: var(--oscd-theme-base0, #839496);
      --oscd-base1: var(--oscd-theme-base1, #93a1a1);
      --oscd-base2: var(--oscd-theme-base2, #eee8d5);
      --oscd-base3: var(--oscd-theme-base3, #fdf6e3);

      --oscd-text-font: var(--oscd-theme-text-font, 'Roboto');
      --oscd-icon-font: var(--oscd-theme-icon-font, 'Material Icons');
    }

    main {
      margin: 1rem;
      background-color: var(--oscd-base2);
      color: var(--oscd-base01);
      font-family: var(--oscd-text-font);
    }

    #ied-selector {
      --md-filled-select-text-field-input-text-size: 18px;

      margin-bottom: 1rem;
    }

    #group-title {
      font-size: 15px;
      margin: 0.5rem;
    }
  `;
}
