import { LitElement, html, css, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

import 'mbg-val-input/mbg-val-input.js';

import '@material/web/textfield/filled-text-field.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/radio/radio.js';

function searchLDevice(instance, searchTerm) {
  if (!searchTerm || instance.nodeName !== 'LDevice') return true;

  // get the LDevice instance
  const lDevice = instance.getAttribute('inst');

  // check if it is given a description
  const desc = instance.getAttribute('desc') ?? '';
  if (desc) {
    if (desc.toLowerCase().includes(searchTerm.toLowerCase())) {
      return true;
    }
  }

  return lDevice.toLowerCase().includes(searchTerm.toLowerCase());
}

function renderDataModelSpan(key) {
  if (key.nodeName === 'DA' || key.nodeName === 'BDA') {
    return html`<span class="type"
      >${key.nodeName}
      <span class="subtype"
        >(${key.getAttribute('type') || key.getAttribute('bType')})</span
      ></span
    >`;
  }
  return html`<span class="type"
    >${key.nodeName}
    <span class="subtype">(${key.getAttribute('type')})</span></span
  >`;
}

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

// looks for values in DataTypeTemplates
function getTemplateValues(eltType, dataModel, template, path = []) {
  // check if the current instance has nested values
  const childVals = Array.from(eltType.children).filter(
    child => child.tagName === 'Val',
  );

  // if so, clone the values and return
  if (childVals.length > 0) {
    const clonedVals = childVals.map(val => val.cloneNode(true));
    return clonedVals;
  }

  const children = Array.from(eltType.children).filter(child =>
    ['DO', 'DA', 'SDO', 'BDA'].includes(child.tagName),
  );

  const templateValues = new Map();

  dataModel.forEach((value, key) => {
    const matchingChild = children.find(
      child => child.getAttribute('name') === key.getAttribute('name'),
    );
    if (!matchingChild) return;

    // build the path for where the value will be inserted in the IED
    const newPath = path.concat({
      name: key.getAttribute('name'),
      tag: ['DO', 'SDO'].includes(key.tagName) ? 'DOI' : 'DAI',
    });

    if (
      ['DA', 'BDA'].includes(key.nodeName) &&
      key.getAttribute('bType') !== 'Struct'
    ) {
      if (key.querySelector('Val')) {
        templateValues.set(key, {
          value: getTemplateValues(key, value, template, newPath),
          path: newPath,
        });
      }
    } else if (key.getAttribute('type')) {
      const nextEltType = template.querySelector(
        `:scope > [id="${key.getAttribute('type')}"]`,
      );

      if (nextEltType) {
        const nextValues = getTemplateValues(
          nextEltType,
          value,
          template,
          newPath,
        );
        if (nextValues.size > 0) {
          templateValues.set(key, { value: nextValues, path: newPath });
        }
      }
    }
  });

  return templateValues;
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
    iedName: { type: String },
    searchTerm: { type: String },
    searchMode: { type: Number },
  };

  instantiatePath(path, ln) {
    if (path.length === 0) {
      throw new Error('Empty path');
    }

    const edits = [];
    let instance = ln;
    for (let i = 0; i < path.length; i += 1) {
      let nextInstance = instance?.querySelector(
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

    return { parent: instance, edits };
  }

  insertTemplateValues(ln, templateValues) {
    templateValues.forEach(({ value }) => {
      value.forEach(key => {
        const valElements = Array.isArray(key.value) ? key.value : [key.value];

        valElements.forEach(valObj => {
          if (!(valObj instanceof Element)) {
            return;
          }

          // clone element so it is not removed from DataTypeTemplates
          const cloneVal = valObj.cloneNode(true);

          const { parent, edits } = this.instantiatePath(key.path, ln);

          // check if <Val> already exists
          const existingVal = parent.querySelector(':scope > Val');
          if (!existingVal) {
            // if it does not exist, add it to the IED
            edits.push({
              node: cloneVal,
              parent,
              reference: null,
            });
          } else if (!existingVal.textContent) {
            // if it does exist, but is empty, replace with default value
            existingVal.textContent = cloneVal.textContent;
          }

          // Dispatch event once per update
          if (edits.length > 0) {
            this.dispatchEvent(
              new CustomEvent('oscd-edit', {
                composed: true,
                bubbles: true,
                detail: edits,
              }),
            );
          }
        });
      });
    });
  }

  updateValue(value, ln, path) {
    // start building distinct id for the mbg-value-input
    const parentLD = ln.parentNode.getAttribute('inst');
    const lnClass = ln.getAttribute('lnClass');
    const lnInst = ln.getAttribute('inst');
    let elementID = `${parentLD}-${lnClass}${lnInst}`;
    for (let i = 0; i < path.length; i += 1) {
      elementID += `-${path[i].name}`;
    }
    const input = this.shadowRoot.getElementById(`${elementID}`);

    // eslint-disable-next-line no-param-reassign
    value.textContent = input.value;
    const { parent, edits } = this.instantiatePath(path, ln);
    this.dispatchEvent(
      new CustomEvent('oscd-edit', {
        composed: true,
        bubbles: true,
        detail: [
          ...edits,
          {
            node: value,
            parent,
            reference: null,
          },
        ],
      }),
    );
  }

  renderValueInput(value, ln, path) {
    const lnType = ln.getAttribute('lnType');

    // build distinct id for the mbg-value-input
    const parentLD = ln.parentNode.getAttribute('inst');
    const lnClass = ln.getAttribute('lnClass');
    const lnInst = ln.getAttribute('inst');
    let elementID = `${parentLD}-${lnClass}${lnInst}`;
    for (let i = 0; i < path.length; i += 1) {
      elementID += `-${path[i].name}`;
    }

    // iterate through the path to get the most nested parent DO
    let i = 0;
    let parentDOName = '';
    let parentDOType = '';
    for (; i < path.length - 1; i += 1) {
      if (path[i].tag === 'DAI') {
        break;
      }
      parentDOName = path[i].name;
      parentDOType = this.doc
        .querySelector(
          `:root > DataTypeTemplates > LNodeType[id="${lnType}"] > DO[name="${parentDOName}"]`,
        )
        .getAttribute('type');
    }

    // get the first DA instance from the parent DO
    let parentDAName = path[i].name;
    let parentDA = this.doc?.querySelector(
      `:root > DataTypeTemplates > DOType[id="${parentDOType}"] > DA[name="${parentDAName}"]`,
    );
    i += 1;

    // iterate through the path to get the most nested parent DA
    for (; i < path.length; i += 1) {
      const parentDAType = parentDA.getAttribute('type');
      parentDAName = path[i].name;
      parentDA = this.doc?.querySelector(
        `:root > DataTypeTemplates > DAType[id="${parentDAType}"] > BDA[name="${parentDAName}"]`,
      );
    }

    // get the type of the most nested parent DA
    const bType = parentDA.getAttribute('bType');

    // if it is an enum type, get the ordinal numbers and string labels
    if (bType === 'Enum') {
      const enumType = parentDA.getAttribute('type');
      const enumTypeElement = this.doc.querySelector(
        `:root > DataTypeTemplates > EnumType[id="${enumType}"]`,
      );

      const enumVals = enumTypeElement.querySelectorAll('EnumVal');
      const enumOrdinals = Array.from(enumVals).map(enumVal =>
        enumVal.getAttribute('ord'),
      );
      const enumLabels = Array.from(enumVals).map(
        enumVal => enumVal.textContent,
      );

      return html`<mbg-val-input
        id="${elementID}"
        bType="${bType}"
        .enumOrdinals=${JSON.stringify(enumOrdinals)}
        .enumLabels=${JSON.stringify(enumLabels)}
        default="${value.textContent}"
      ></mbg-val-input>`;
    }

    return html`<mbg-val-input
      id="${elementID}"
      bType="${bType ?? ''}"
      default="${value.textContent}"
    ></mbg-val-input>`;
  }

  renderDataModel(dataModel, values, ln, path = [], odd = false) {
    if (Array.isArray(values)) {
      return html`
        <ul>
          ${values.map(
            value =>
              html` <li>
                ${this.renderValueInput(value, ln, path)}
                <md-icon-button
                  @click=${() => this.updateValue(value, ln, path)}
                  ><md-icon>save</md-icon></md-icon-button
                >
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
        html` <details class="${classMap({ odd })}">
          <summary class="${classMap({ instantiated: values?.has(key) })}">
            ${key.getAttribute('name')}
            ${value.size === 0 && !values?.get(key)?.length
              ? html`<md-icon-button
                  @click=${() => {
                    const val = key.ownerDocument.createElementNS(
                      ln.namespaceURI,
                      'Val',
                    );
                    // set the value to an empty string for user to edit
                    val.textContent = '';
                    const { parent, edits } = this.instantiatePath(
                      path.concat([
                        { name: key.getAttribute('name'), tag: 'DAI' },
                      ]),
                      ln,
                    );
                    this.dispatchEvent(
                      new CustomEvent('oscd-edit', {
                        composed: true,
                        bubbles: true,
                        detail: [
                          ...edits,
                          {
                            node: val,
                            parent,
                            reference: null,
                          },
                        ],
                      }),
                    );
                  }}
                  ><md-icon>add</md-icon></md-icon-button
                >`
              : nothing}
            ${renderDataModelSpan(key)}
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
    const template = this.doc?.querySelector(`:root > DataTypeTemplates`);
    const lnType = template.querySelector(
      `:scope > LNodeType[id="${ln.getAttribute('lnType')}"]`,
    );

    const dataModel = getDataModel(lnType);

    const templateValues = getTemplateValues(lnType, dataModel, template);
    this.insertTemplateValues(ln, templateValues);
    const values = getValues(ln, dataModel);

    return this.renderDataModel(dataModel, values, ln);
  }

  handleRadioChange(e) {
    const selectedRadio = e.target;
    if (selectedRadio) {
      const extensionType = selectedRadio.getAttribute('value');
      this.searchMode = parseInt(extensionType, 10);
    }
  }

  searchLN(instance, searchTerm) {
    if (!searchTerm) return true;

    // get the LN name and instance
    const lnClass =
      instance.getAttribute('prefix') +
      instance.getAttribute('lnClass') +
      instance.getAttribute('inst');

    // get the LN type
    const lnType = instance.getAttribute('lnType');

    // check if it is given a description
    const lnTemplate = this.doc?.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${instance.getAttribute('lnType')}"]`,
    );
    const lnDesc =
      (instance.getAttribute('desc') || lnTemplate?.getAttribute('desc')) ?? '';
    if (lnDesc) {
      if (lnDesc.toLowerCase().includes(searchTerm.toLowerCase())) {
        return true;
      }
    }

    // if instance is an LDevice, check if any of its child LN elements match the search term
    if (instance.nodeName === 'LDevice') {
      const lnElements = Array.from(
        instance.querySelectorAll(':scope > LN0, :scope > LN'),
      );
      return lnElements.some(ln => this.searchLN(ln, searchTerm));
    }

    return (
      lnClass.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lnType.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  searchElt(instance, searchTerm) {
    if (!searchTerm) return true;

    switch (this.searchMode) {
      case 1:
        return searchLDevice(instance, searchTerm);
      case 2:
        return this.searchLN(instance, searchTerm);
      case 0:
      default:
        return (
          this.searchLN(instance, searchTerm) ||
          searchLDevice(instance, searchTerm)
        );
    }
  }

  resetSearch() {
    this.searchTerm = '';

    // empty value in the search field
    const searchInput = this.shadowRoot.querySelector('.search-input');
    searchInput.value = '';

    this.requestUpdate();
  }

  render() {
    return html`
      <main>
        <div class="search-container">
          <div class="search-field">
            <md-filled-text-field
              class="search-input"
              label="Search"
              @input=${e => {
                this.searchTerm = e.target.value;
              }}
            >
              <md-icon slot="leading-icon">search</md-icon>
              <md-icon-button
                aria-label="Clear search"
                slot="trailing-icon"
                title="Clear search"
                @click=${() => this.resetSearch()}
              >
                <md-icon>clear</md-icon>
              </md-icon-button>
            </md-filled-text-field>
          </div>

          <div class="search-settings" role="radiogroup" aria-label="Display">
            <p>Display:</p>
            <form
              id="search-mode"
              slot="content"
              method="dialog"
              @change=${this.handleRadioChange}
            >
              <md-radio
                name="element"
                value="0"
                aria-label="All"
                touch-target="wrapper"
                checked
              ></md-radio>
              <label aria-hidden="true">All</label>
              <md-radio
                name="element"
                value="1"
                aria-label="LDevice"
                touch-target="wrapper"
              ></md-radio>
              <label aria-hidden="true">LDevice</label>
              <md-radio
                name="element"
                value="2"
                aria-label="LN"
                touch-target="wrapper"
              ></md-radio>
              <label aria-hidden="true">LN</label>
            </form>
          </div>
        </div>

        ${Array.from(
          this.ied.querySelectorAll(':scope > AccessPoint > Server'),
        ).map(
          server =>
            html` <details class="odd" open>
              <summary>
                ${server.parentElement.getAttribute('name')} Server
              </summary>
              ${Array.from(server.querySelectorAll(':scope > LDevice'))
                .filter(ld => this.searchElt(ld, this.searchTerm))
                .map(
                  ld => html`
                    <details open>
                      <summary>
                        ${ld.getAttribute('inst')}
                        <span class="type">${ld.nodeName}</span>
                      </summary>
                      ${Array.from(
                        ld.querySelectorAll(':scope > LN0, :scope > LN'),
                      )
                        .filter(ln => this.searchElt(ln, this.searchTerm))
                        .map(
                          ln => html`
                            <details class="odd">
                              <summary>
                                ${ln.getAttribute('prefix')}${ln.getAttribute(
                                  'lnClass',
                                )}${ln.getAttribute('inst')}
                                <span class="type">
                                  ${ln.nodeName}
                                  <span class="subtype"
                                    >(${ln.getAttribute('lnType')})</span
                                  >
                                </span>
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
    :host {
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

    main > details {
      width: max-content;
    }

    md-filled-text-field {
      width: 300px;
    }

    .search-field {
      display: flex;
      align-items: center;
    }

    .search-settings {
      display: flex;
      align-items: center;
    }

    .search-settings p {
      font-family: var(--oscd-theme-text-font);
      font-weight: bold;
    }

    #search-mode {
      display: flex;
      align-self: center;
      align-items: center;
      margin-bottom: auto;
    }

    label {
      font-family: var(--oscd-theme-text-font);
      color: var(--oscd-base01);
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

    summary.instantiated {
      color: var(--oscd-primary);
    }

    span.type {
      opacity: 0;
      transition: opacity 0.05s cubic-bezier(0.9, 0, 1, 0.45);
      padding-left: 3rem;
      font-weight: normal;
      font-size: 16px;
      vertical-align: middle;
      float: right;
    }

    span.subtype {
      font-size: 13px;
    }

    summary:hover {
      font-weight: bold;
    }

    details:hover > summary > span.type {
      opacity: 0.7;
      transition: opacity 0.2s cubic-bezier(0, 0.9, 0.45, 1);
    }

    ul {
      margin: 0px;
      list-style-type: none;
      padding: 10px 0px 10px 0px;
    }

    md-icon-button {
      vertical-align: sub;
    }

    .ied-name md-icon-button,
    .search-field md-icon-button,
    details.odd > * > md-icon-button,
    details.odd > * > * > md-icon-button {
      --md-icon-button-hover-state-layer-color: var(--oscd-base2);
      --md-icon-button-hover-icon-color: var(--oscd-base01);
    }

    details:last-of-type[open] {
      padding-bottom: var(--mbg-ied-editor-spacing);
    }

    details.odd > * > mbg-val-input[bType='Quality'],
    details.odd > * > * > mbg-val-input[bType='Quality'],
    details.odd > * > mbg-val-input[bType='Currency'],
    details.odd > * > * > mbg-val-input[bType='Currency'],
    details.odd > * > mbg-val-input[bType='Enum'],
    details.odd > * > * > mbg-val-input[bType='Enum'] {
      --md-sys-color-surface-container-highest: var(--oscd-base2);
      --md-sys-color-surface-container: var(--oscd-base3);
      --md-sys-color-secondary-container: var(--oscd-base2);
    }

    mbg-val-input[bType='Quality'],
    mbg-val-input[bType='Currency'],
    mbg-val-input[bType='Enum'] {
      --md-sys-color-surface-container-highest: var(--oscd-base3);
      --md-sys-color-surface-container: var(--oscd-base3);
      --md-sys-color-secondary-container: var(--oscd-base2);
    }
  `;
}
