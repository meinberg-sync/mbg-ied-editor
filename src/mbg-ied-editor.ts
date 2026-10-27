import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { SetAttributes } from '@omicronenergy/oscd-api';
import { newEditEventV2 } from '@omicronenergy/oscd-api/utils.js';
import { updateIED, Update } from '@openenergytools/scl-lib';

import { IedEditor } from './ied-editor.js';

import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';

customElements.define('ied-editor', IedEditor);

function meinbergFirst(a: string, b: string) {
  if (a.toLowerCase().startsWith('meinberg')) return -1;
  if (b.toLowerCase().startsWith('meinberg')) return 1;
  return 0;
}

export default class MbgIedEditor extends LitElement {
  @property({ type: Object }) doc?: Document;

  @property({ type: Object }) ied?: Element;

  @property({ type: String }) docName? = '';

  @property({ type: Number }) editCount = 0;

  @property({ type: String }) iedName = '';

  protected updated(changed: Map<string, unknown>) {
    super.updated?.(changed);

    if (changed.has('doc') || changed.has('docName')) {
      // reset the selector
      const selector = this.shadowRoot?.querySelector(
        '#ied-selector',
      ) as HTMLSelectElement;
      selector.value = '';
      this.updateEditorDisplay({ target: selector } as unknown as Event);
    }
  }

  private updateIedEditor() {
    // trigger update to IedEditor
    const iedEditor = this.shadowRoot?.querySelector<IedEditor>('ied-editor');
    iedEditor?.requestUpdate();
  }

  private updateEditorDisplay(e: Event) {
    if (!e.target) return;

    const iedSelector = e.target as HTMLSelectElement;

    // show edit button if a valid IED is selected
    const button = this.shadowRoot?.querySelector('#edit-name-button');
    if (iedSelector.value !== '' && !button?.classList.contains('show')) {
      button?.classList.toggle('show');
    }

    // update the textfield with the selected IED name
    const iedNameInput = this.shadowRoot?.querySelector(
      '.ied-name',
    ) as HTMLInputElement;
    iedNameInput.value = iedSelector.value;

    this.ied = this.doc?.querySelector(
      `IED[name="${iedSelector.value}"]`,
    ) as Element;

    this.requestUpdate();
    this.updateIedEditor();
  }

  private showIedNameInput() {
    const iedNameContainer = this.shadowRoot?.querySelector(
      '#ied-name-input',
    ) as HTMLDivElement;
    iedNameContainer.classList.toggle('show');

    const button = this.shadowRoot?.querySelector(
      '#edit-name-button',
    ) as HTMLButtonElement;
    const icon = button.querySelector('md-icon') as HTMLSpanElement;
    const tooltip = this.shadowRoot?.querySelector(
      '#edit-name-tooltip',
    ) as HTMLSpanElement;

    if (iedNameContainer.classList.contains('show')) {
      icon.textContent = 'cancel';
      tooltip.textContent = 'Click to close the IED name editor';
    } else {
      icon.textContent = 'edit';
      tooltip.textContent = 'Click to edit the IED name';
    }
  }

  private enterIEDName() {
    if (this.iedName !== '' && this.ied) {
      const newNameAttribute: SetAttributes = {
        element: this.ied,
        attributes: { name: this.iedName },
      };

      if (document.body.querySelector('oscd-shell') !== null) {
        // use oscd-api to update the IED's name
        this.dispatchEvent(
          newEditEventV2(updateIED(newNameAttribute as unknown as Update)),
        );
      } else {
        // ensure backwards compatibility
        this.dispatchEvent(
          new CustomEvent('oscd-edit', {
            composed: true,
            bubbles: true,
            detail: updateIED(newNameAttribute as unknown as Update),
          }),
        );
      }

      // reset selector
      const selector = this.shadowRoot?.querySelector(
        '#ied-selector',
      ) as HTMLSelectElement;
      selector.value = '';
      this.updateEditorDisplay({ target: selector } as unknown as Event);

      // hide text field and button
      this.showIedNameInput();
      const button = this.shadowRoot?.querySelector(
        '#edit-name-button',
      ) as HTMLButtonElement;
      button.classList.toggle('show');
    }
  }

  render() {
    const iedsByManufacturer: Record<string, Element[]> = {};
    this.doc?.querySelectorAll(':root > IED').forEach(ied => {
      const manufacturer = ied.getAttribute('manufacturer') as string;
      if (!iedsByManufacturer[manufacturer])
        iedsByManufacturer[manufacturer] = [];
      iedsByManufacturer[manufacturer].push(ied);
    });
    const manufacturers = Object.keys(iedsByManufacturer).sort(meinbergFirst);

    return html`
      <main>
        <div class="ied-name-header">
          <md-icon class="ied-icon">network_intel_node</md-icon>
          <div class="ied-name-container">
            <div class="ied-select-container">
              <md-outlined-select
                id="ied-selector"
                label="Select IED"
                @change=${this.updateEditorDisplay}
              >
                <md-select-option value="" class="placeholder">
                  <div slot="headline"></div>
                </md-select-option>
                ${repeat(
                  manufacturers,
                  manufacturer => manufacturer,
                  manufacturer => html`
                    <h3 class="group-title">${manufacturer}</h3>
                    ${repeat(
                      iedsByManufacturer[manufacturer],
                      ied => ied,
                      ied => html`
                        <md-select-option
                          value="${ied.getAttribute('name') as string}"
                        >
                          <div slot="headline">${ied.getAttribute('name')}</div>
                        </md-select-option>
                      `,
                    )}
                  `,
                )}
              </md-outlined-select>
              <div class="ied-button-container">
                <md-outlined-icon-button
                  aria-label="Edit IED Name"
                  class="hidden-input"
                  id="edit-name-button"
                  @click=${() => this.showIedNameInput()}
                >
                  <md-icon>edit</md-icon>
                </md-outlined-icon-button>
                <span id="edit-name-tooltip">Click to edit the IED name</span>
              </div>
            </div>

            <div id="ied-name-input">
              <md-outlined-text-field
                class="ied-name"
                label="Edit IED Name"
                value="${this.ied?.getAttribute('name') as string}"
                @change=${(e: Event) => {
                  this.iedName = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: Event) => {
                  if ((e as KeyboardEvent).key === 'Enter') {
                    this.iedName = (e.target as HTMLInputElement).value;
                    this.enterIEDName();
                  }
                }}
              >
                <md-icon-button
                  aria-label="Save"
                  slot="trailing-icon"
                  @click=${() => this.enterIEDName()}
                >
                  <md-icon>save_as</md-icon>
                </md-icon-button>
              </md-outlined-text-field>
            </div>
          </div>
        </div>

        ${this.ied &&
        html`<ied-editor
          .doc=${this.doc}
          .docName=${this.docName}
          .ied=${this.ied}
          .editCount=${this.editCount}
        ></ied-editor>`}
      </main>
    `;
  }

  static styles = css`
    :host {
      --mbg-shape: 10px;
      --mbg-space: 8px;
      --mbg-height: 40px;
      --mbg-gap-md: 1rem;
      --mbg-gap-sm: 0.5rem;

      --mbg-motion-fast: 0.2s;
      --mbg-motion-medium: 0.3s;

      --mbg-text-lg: 18px;
      --mbg-text-md: 14px;
      --mbg-text-sm: 12px;

      scrollbar-color: var(--oscd-primary) var(--oscd-base3);

      --md-sys-color-surface-container-highest: var(--oscd-base3);
      --md-sys-color-surface-container: var(--oscd-base3);
      --md-sys-color-secondary-container: var(--oscd-base2);
      --md-sys-color-primary: var(--oscd-primary);
      --md-sys-color-on-surface-variant: var(--oscd-base00);
      --md-sys-color-on-surface: var(--oscd-base00);
      --md-sys-typescale-body-large-font: var(--oscd-text-font);

      --md-icon-button-state-layer-height: 26px;
      --md-icon-button-state-layer-width: 26px;
      --md-icon-button-icon-size: 24px;
      --md-icon-button-hover-state-layer-color: var(--oscd-base3);
      --md-icon-button-hover-icon-color: var(--oscd-base00);
      --md-icon-button-hover-state-layer-opacity: 1;

      --md-outlined-icon-button-container-shape: var(--mbg-shape);
      --md-outlined-icon-button-size: 24px;

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

    @media (prefers-reduced-motion: reduce) {
      :host {
        --mbg-motion-fast: 0s;
        --mbg-motion-medium: 0s;
      }
    }

    main {
      padding: var(--mbg-gap-md);
      margin: var(--mbg-gap-md);
      border-radius: var(--mbg-shape);
      background-color: var(--oscd-base2);
      color: var(--oscd-base01);
      font-family: var(--oscd-text-font);
    }

    .ied-name-header {
      display: flex;
      align-items: center;
      width: min-content;
      background: var(--oscd-base3);
      gap: var(--mbg-gap-sm);
      padding: var(--mbg-gap-sm);
      border-radius: var(--mbg-shape);
    }

    .ied-name-container {
      display: flex;
      flex-direction: column;
    }

    .ied-select-container {
      display: flex;
      align-items: center;
    }

    .ied-icon {
      padding: 0 var(--mbg-space);
    }

    #ied-selector {
      height: var(--mbg-height);

      --md-outlined-select-text-field-container-shape: var(--mbg-shape);
      --md-outlined-field-top-space: var(--mbg-space);
      --md-outlined-field-bottom-space: var(--mbg-space);
    }

    .placeholder {
      display: none;
    }

    .group-title {
      font-size: var(--mbg-text-md);
      margin: var(--mbg-gap-sm);
    }

    .ied-button-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hidden-input {
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition:
        opacity var(--mbg-motion-medium) ease,
        max-width var(--mbg-motion-medium) ease;
    }

    .hidden-input.show {
      opacity: 1;
      max-width: 600px;
      overflow: visible;
    }

    #edit-name-button.show {
      margin-left: var(--mbg-gap-sm);
    }

    #ied-name-input {
      overflow: hidden;
      max-height: 0;
      transition: max-height var(--mbg-motion-medium) ease-out;
    }

    #ied-name-input.show {
      max-height: 5rem;
      padding-top: var(--mbg-gap-sm);
      margin-top: var(--mbg-gap-sm);
      transition: max-height var(--mbg-motion-medium) ease-in;
    }

    .ied-name {
      width: 100%;
      --md-outlined-text-field-top-space: var(--mbg-space);
      --md-outlined-text-field-bottom-space: var(--mbg-space);
    }

    #edit-name-tooltip {
      visibility: hidden;
      background-color: var(--oscd-base00);
      padding: var(--mbg-space);
      color: var(--oscd-base3);
      font-size: var(--mbg-text-md);
      border-radius: 6px;
      border: 1px solid var(--oscd-base00);
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
      white-space: nowrap;

      /* Position to the right of the button */
      position: absolute;
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: 12px;
      z-index: 1;

      /* Fade in and out */
      opacity: 0;
      transition: opacity 0.5s ease;
    }

    #edit-name-button.show:hover + #edit-name-tooltip {
      visibility: visible;
      opacity: 1;
    }

    #edit-name-tooltip::after {
      content: ' ';
      position: absolute;
      right: 100%;
      top: 50%;
      margin-top: -10px;
      border-width: 10px;
      border-style: solid;
      border-color: transparent var(--oscd-base00) transparent transparent;
    }
  `;
}
