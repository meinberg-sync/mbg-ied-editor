import { LitElement, html, css, nothing } from 'lit';
import { updateIED } from '@openenergytools/scl-lib';

import '@material/web/textfield/filled-text-field.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';

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

  renderDataModel(dataModel, values, ln, path = []) {
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
                          node: value,
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
        html` <details>
          <summary style="${values?.has(key) ? 'font-weight: bold;' : nothing}">
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
          </summary>
          ${this.renderDataModel(
            value,
            values?.get(key),
            ln,
            path.concat({
              name: key.getAttribute('name'),
              tag: ['DO', 'SDO'].includes(key.tagName) ? 'DOI' : 'DAI',
            }),
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
            html` <details open>
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
                        <details>
                          <summary>
                            ${ln.getAttribute('prefix')}${ln.getAttribute(
                              'lnClass',
                            )}${ln.getAttribute('inst')}
                          </summary>
                          Type: ${ln.getAttribute('lnType')}
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
    main {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    details {
      padding-left: 1rem;
    }

    summary {
      user-select: none;
    }
  `;
}
