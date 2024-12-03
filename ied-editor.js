import { LitElement, html, css, nothing } from 'lit';
import { updateIED } from '@openenergytools/scl-lib';

import '@material/web/textfield/filled-text-field.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';

function findInstanceToRemove(element) {
  const parent = element.parentElement;
  const siblings = Array.from(parent.children).filter(
    child => child.tagName === element.tagName,
  );

  if (siblings.length > 1 || !['DAI', 'DOI'].includes(parent.tagName)) {
    return element;
  }

  return findInstanceToRemove(parent);
}

function getValues(instance, dataModel) {
  // instance -> DOI* -> DAI* -> Val
  // match DOI name w/ DO name (same with DAI and DA)
  const childVals = Array.from(instance.children).filter(
    child => child.tagName === 'Val',
  );
  if (childVals.length > 0) {
    return childVals;
  }

  const children = Array.from(instance.children).filter(child =>
    ['DOI', 'DAI'].includes(child.tagName),
  );

  const childNames = children.map(child => child.getAttribute('name'));
  const values = new Map();

  dataModel.forEach((value, key) => {
    if (childNames.includes(key.getAttribute('name'))) {
      values.set(
        key,
        getValues(
          children.find(
            child => child.getAttribute('name') === key.getAttribute('name'),
          ),
          value,
        ),
      );
    }
  });

  return values;
}

function getDataModel(dataType) {
  const children = Array.from(dataType.children).filter(child =>
    ['DO', 'DA', 'SDO', 'BDA'].includes(child.tagName),
  );
  const dataModel = new Map();

  for (const child of children) {
    const childType = dataType
      .closest('DataTypeTemplates')
      .querySelector(`:scope > [id="${child.getAttribute('type')}"]`);
    if (childType) dataModel.set(child, getDataModel(childType));
    else dataModel.set(child, new Map());
  }

  return dataModel;
}

export class IedEditor extends LitElement {
  static properties = {
    doc: {},
    ied: {},
    editCount: { type: Number },
  };

  instanciatePath(path, ln) {
    if (path.length === 0) {
      throw new Error('Empty path');
    }

    const edits = [];
    let instance = ln.querySelector(`:scope > [name="${path[0].name}"]`);
    for (let i = 1; i < path.length; i += 1) {
      let nextInstance = instance.querySelector(
        `:scope > [name="${path[i].name}"]`,
      );
      if (!nextInstance) {
        nextInstance = this.doc.createElementNS(ln.namespaceURI, path[i].tag);
        nextInstance.setAttribute('name', path[i].name);
        edits.push({
          node: nextInstance,
          parent: instance,
          reference: null,
        });
      }
      instance = nextInstance;
    }

    this.dispatchEvent(
      new CustomEvent('oscd-edit', {
        composed: true,
        bubbles: true,
        detail: edits,
      }),
    );
    return instance;
  }

  renderDataModel(dataModel, values, ln, path = [], odd = false) {
    if (Array.isArray(values)) {
      return html`
        <ul>
          ${values.map(
            value =>
              html` <li>
                ${value.textContent}
                <md-icon-button
                  @click=${() =>
                    this.dispatchEvent(
                      new CustomEvent('oscd-edit', {
                        composed: true,
                        bubbles: true,
                        detail: {
                          node: findInstanceToRemove(value),
                        },
                      }),
                    )}
                  ><md-icon>delete</md-icon></md-icon-button
                >
              </li>`,
          )}
        </ul>
      `;
    }

    return dataModel.entries().map(
      ([key, value]) =>
        html` <details class="${odd ? 'odd' : nothing}">
          <summary
            style="${values?.has(key)
              ? 'font-weight: bold; color: var(--oscd-primary)'
              : nothing}"
          >
            ${key.getAttribute('name')}
            ${value.size === 0
              ? html`<md-icon-button
                  @click=${() => {
                    const val = key.ownerDocument.createElementNS(
                      ln.namespaceURI,
                      'Val',
                    );
                    val.textContent = prompt('Value');
                    this.dispatchEvent(
                      new CustomEvent('oscd-edit', {
                        composed: true,
                        bubbles: true,
                        detail: {
                          node: val,
                          parent: this.instanciatePath(
                            path.concat([
                              { name: key.getAttribute('name'), tag: 'DAI' },
                            ]),
                            ln,
                          ),
                          reference: null,
                        },
                      }),
                    );
                  }}
                  ><md-icon>add</md-icon></md-icon-button
                >`
              : nothing}
            <span class="type"
              >${key.getAttribute('type') || key.getAttribute('bType')}</span
            >
          </summary>
          ${this.renderDataModel(
            value,
            values?.get(key),
            ln,
            path.concat({
              name: key.getAttribute('name'),
              tag: ['DO', 'SDO'].includes(key.tagName) ? 'DOI' : 'DAI',
            }),
            !odd,
          )}
        </details>`,
    );
  }

  renderLN(ln) {
    const lnType = this.doc?.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${ln.getAttribute('lnType')}"]`,
    );
    const dataModel = getDataModel(lnType);
    const values = getValues(ln, dataModel);
    return this.renderDataModel(dataModel, values, ln);
  }

  render() {
    return html`
      <main>
        <md-filled-text-field
          label="name"
          value="${this.ied?.getAttribute('name')}"
          @change=${e =>
            this.dispatchEvent(
              new CustomEvent('oscd-edit', {
                composed: true,
                bubbles: true,
                detail: updateIED({
                  element: this.ied,
                  attributes: { name: e.target.value },
                }),
              }),
            )}
        >
        </md-filled-text-field>

        ${Array.from(
          this.ied.querySelectorAll(':scope > AccessPoint > Server'),
        ).map(
          server =>
            html` <details class="odd" open>
              <summary>
                ${server.parentElement.getAttribute('name')} Server
              </summary>
              ${Array.from(server.querySelectorAll(':scope > LDevice')).map(
                ld => html`
                  <details open>
                    <summary>${ld.getAttribute('inst')}</summary>
                    ${Array.from(
                      ld.querySelectorAll(':scope > LN0, :scope > LN'),
                    ).map(
                      ln => html`
                        <details class="odd">
                          <summary>
                            ${ln.getAttribute('prefix')}${ln.getAttribute(
                              'lnClass',
                            )}${ln.getAttribute('inst')}
                            <span class="type"
                              >${ln.getAttribute('lnType')}</span
                            >
                          </summary>
                          ${this.renderLN(ln)}
                        </details>
                      `,
                    )}
                  </details>
                `,
              )}
            </details>`,
        )}
      </main>
    `;
  }

  static styles = css`
    * {
      --mbg-ied-editor-spacing: 1rem;

      --md-sys-color-surface-container-highest: var(--oscd-base3);
      --md-sys-color-primary: var(--oscd-primary);
      --md-sys-color-on-surface-variant: var(--oscd-base00);
      --md-sys-typescale-body-large-font: var(--oscd-text-font);

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
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    md-filled-text-field {
      width: max-content;
    }

    details {
      padding-left: var(--mbg-ied-editor-spacing);
      padding-right: var(--mbg-ied-editor-spacing);
      font-size: 20px;
      line-height: 1.5;
      background: var(--oscd-base2);
      color: var(--oscd-base01);
    }

    details.odd {
      background: var(--oscd-base3);
      color: var(--oscd-base00);
    }

    summary {
      user-select: none;
    }

    span.type {
      display: inline-block;
      opacity: 0;
      transition: opacity 0.05s cubic-bezier(0.9, 0, 1, 0.45);
      padding-left: 1rem;
      font-weight: normal;
      font-size: 16px;
      vertical-align: middle;
    }

    details:hover > summary > span.type {
      opacity: 0.7;
      transition: opacity 0.2s cubic-bezier(0, 0.9, 0.45, 1);
    }

    ul {
      margin: 0px;
    }

    md-icon-button {
      vertical-align: sub;
    }

    details.odd > * > md-icon-button,
    details.odd > * > * > md-icon-button {
      --md-icon-button-hover-state-layer-color: var(--oscd-base2);
      --md-icon-button-hover-icon-color: var(--oscd-base01);
    }

    details:last-of-type[open] {
      padding-bottom: var(--mbg-ied-editor-spacing);
    }
  `;
}
