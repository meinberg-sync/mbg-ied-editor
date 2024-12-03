import { LitElement, html, css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { IedEditor } from './ied-editor.js';

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
    main {
      margin: 1rem;
    }
  `;
}
