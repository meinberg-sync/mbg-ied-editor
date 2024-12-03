import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { IedEditor } from './ied-editor.js';

import '@material/web/icon/icon.js';

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
        <select
          name="ieds"
          id="ied-selector"
          @change=${() => this.requestUpdate()}
        >
          <option value="">Select IED</option>
          ${repeat(
            manufacturers,
            manufacturer => manufacturer,
            manufacturer => html`
              <optgroup label="${manufacturer}">
                ${repeat(
                  iedsByManufacturer[manufacturer],
                  ied => ied,
                  ied => html`
                    <option value="${ied.getAttribute('name')}">
                      ${ied.getAttribute('name')}
                    </option>
                  `,
                )}
              </optgroup>
            `,
          )}
        </select>
        <md-icon class="dropdown-icon">arrow_drop_down</md-icon>

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
      margin-bottom: 1rem;
      appearance: none;
      padding: 16px 32px 16px 16px;
      text-align: left;
      font-size: 18px;
      background-color: var(--oscd-base3);
      color: var(--oscd-base00);
      border: none;
      border-bottom: 1px solid var(--oscd-base0);
      border-radius: 4px 4px 0 0;
    }

    #ied-selector:focus {
      outline: none;
    }

    .dropdown-icon {
      position: relative;
      left: -34px;
      top: 6px;
    }
  `;
}
