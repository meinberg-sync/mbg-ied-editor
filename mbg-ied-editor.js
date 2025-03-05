import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { updateIED } from '@openenergytools/scl-lib';

import { IedEditor } from './ied-editor.js';

import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/select/filled-select.js';
import '@material/web/select/select-option.js';
import '@material/web/textfield/filled-text-field.js';

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

  updateEditor(e) {
    // show edit button if a valid IED is selected
    const button = this.shadowRoot.querySelector('#edit-name-button');
    if (e.target.value !== '' && !button.classList.contains('show')) {
      button.classList.toggle('show');
    }

    // update the textfield with the selected IED name
    const iedNameInput = this.shadowRoot.querySelector('.ied-name');
    iedNameInput.value = e.target.value;

    this.requestUpdate();
  }

  showIedNameInput() {
    const iedNameContainer = this.shadowRoot.querySelector('#ied-name-input');
    const button = this.shadowRoot.querySelector('#edit-name-button');
    const icon = button.querySelector('md-icon');
    iedNameContainer.classList.toggle('show');

    if (iedNameContainer.classList.contains('show')) {
      button.setAttribute('title', 'Close IED name editor');
      icon.textContent = 'cancel';
    } else {
      button.setAttribute('title', 'Edit IED name');
      icon.textContent = 'edit';
    }
  }

  enterIEDName() {
    if (this.iedName !== '' && this.ied) {
      // update the IED with the new name
      this.dispatchEvent(
        new CustomEvent('oscd-edit', {
          composed: true,
          bubbles: true,
          detail: updateIED({
            element: this.ied,
            attributes: { name: this.iedName },
          }),
        }),
      );

      // reset selector
      const selector = this.shadowRoot.querySelector('#ied-selector');
      selector.value = '';

      // hide text field and button
      this.showIedNameInput();
      const button = this.shadowRoot.querySelector('#edit-name-button');
      button.classList.toggle('show');

      this.requestUpdate();
    }
  }

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
        <div class="ied-name-container">
          <md-filled-select
            id="ied-selector"
            label="Select IED"
            aria-labelledby="group-title"
            @change=${this.updateEditor}
          >
            <md-select-option value="">
              <div slot="headline"></div>
            </md-select-option>
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

          <div class="ied-input-container">
            <md-icon-button
              aria-label="Edit IED Name"
              class="hidden-input"
              id="edit-name-button"
              title="Edit the IED name"
              @click=${() => this.showIedNameInput()}
            >
              <md-icon>edit</md-icon>
            </md-icon-button>
            <div class="hidden-input" id="ied-name-input">
              <md-filled-text-field
                class="ied-name"
                label="Edit IED Name"
                value="${this.ied?.getAttribute('name')}"
                @change=${e => {
                  this.iedName = e.target.value;
                }}
                @keydown=${e => {
                  if (e.key === 'Enter') {
                    this.iedName = e.target.value;
                    this.enterIEDName();
                  }
                }}
              >
                <md-icon-button
                  aria-label="Save"
                  slot="trailing-icon"
                  title="Enter and Save the new IED name"
                  @click=${() => this.enterIEDName()}
                >
                  <md-icon>save_as</md-icon>
                </md-icon-button>
              </md-filled-text-field>
            </div>
          </div>
        </div>

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
      --md-sys-color-on-surface-variant: var(--oscd-base00);
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

      --md-filled-text-field-active-indicator-color: var(--oscd-base0);
      --md-filled-text-field-active-indicator-height: 1px;
      --md-filled-text-field-label-text-color: var(--oscd-base1);
      --md-filled-text-field-input-text-color: var(--oscd-base00);
      --md-filled-text-field-hover-label-text-color: var(--oscd-base0);
      --md-filled-text-field-hover-input-text-color: var(--oscd-base01);
      --md-filled-text-field-focus-label-text-color: var(--oscd-primary);
      --md-filled-text-field-focus-input-text-color: var(--oscd-base01);
      --md-filled-text-field-input-text-size: 18px;

      --md-icon-button-state-layer-height: 26px;
      --md-icon-button-state-layer-width: 26px;
      --md-icon-button-icon-size: 24px;
      --md-icon-button-hover-state-layer-color: var(--oscd-base3);
      --md-icon-button-hover-icon-color: var(--oscd-base00);
      --md-icon-button-hover-state-layer-opacity: 1;

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

    .ied-name-container {
      display: flex;
      align-items: center;
      margin-bottom: 1rem;
      column-gap: 0.5rem;
    }

    #ied-selector {
      --md-filled-select-text-field-input-text-size: 18px;
    }

    #group-title {
      font-size: 15px;
      margin: 0.5rem;
    }

    .ied-input-container {
      display: flex;
      align-items: center;
      column-gap: 0.5rem;
    }

    .hidden-input {
      opacity: 0;
      height: 0;
      overflow: hidden;
      transition:
        opacity 0.5s ease,
        height 0.5s ease;
    }

    .hidden-input.show {
      opacity: 1;
      height: auto;
    }

    .ied-name md-icon-button {
      --md-icon-button-hover-state-layer-color: var(--oscd-base2);
      --md-icon-button-hover-icon-color: var(--oscd-base01);
    }
  `;
}
