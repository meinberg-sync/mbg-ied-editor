import { LitElement, html, css, nothing, render } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { classMap } from 'lit/directives/class-map.js';
import { property } from 'lit/decorators.js';

import { identity } from '@openenergytools/scl-lib';

import 'mbg-val-input/mbg-val-input.js';

import '@material/web/textfield/filled-text-field.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/radio/radio.js';

function searchSelectorIED(searchTerm: string) {
  return `:scope > AccessPoint > Server > LDevice[inst*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice[desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN0[lnClass*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN0[lnType*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN0[desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN[lnClass*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN[lnType*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN[desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN0 > *[desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN0 > * [desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN > *[desc*="${searchTerm}"],
  :scope > AccessPoint > Server > LDevice > LN > * [desc*="${searchTerm}"]`;
}

function searchSelectorTemplates(searchTerm: string) {
  return `:root > DataTypeTemplates > LNodeType[id*="${searchTerm}"],
  :root > DataTypeTemplates > LNodeType[lnClass*="${searchTerm}"],
  :root > DataTypeTemplates > LNodeType[desc*="${searchTerm}"],
  :root > DataTypeTemplates > LNodeType > DO[name*="${searchTerm}"],
  :root > DataTypeTemplates > LNodeType > DO[type*="${searchTerm}"],
  :root > DataTypeTemplates > LNodeType > DO[desc*="${searchTerm}"],
  :root > DataTypeTemplates > DOType[id*="${searchTerm}"],
  :root > DataTypeTemplates > DOType[cdc*="${searchTerm}"],
  :root > DataTypeTemplates > DOType[desc*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > SDO[name*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > SDO[type*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > SDO[desc*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > DA[name*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > DA[fc*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > DA[bType*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > DA[type*="${searchTerm}"],
  :root > DataTypeTemplates > DOType > DA[desc*="${searchTerm}"],
  :root > DataTypeTemplates > DAType[id*="${searchTerm}"],
  :root > DataTypeTemplates > DAType[desc*="${searchTerm}"],
  :root > DataTypeTemplates > DAType > BDA[name*="${searchTerm}"],
  :root > DataTypeTemplates > DAType > BDA[fc*="${searchTerm}"],
  :root > DataTypeTemplates > DAType > BDA[bType*="${searchTerm}"],
  :root > DataTypeTemplates > DAType > BDA[type*="${searchTerm}"],
  :root > DataTypeTemplates > DAType > BDA[desc*="${searchTerm}"],
  :root > DataTypeTemplates > EnumType[id*="${searchTerm}"],
  :root > DataTypeTemplates > EnumType[desc*="${searchTerm}"]`;
}

function getInitializedEltPath(element: Element): string {
  let path = [`${element.getAttribute('name')}`];

  // traverse through parent elements until an LN is found
  let parentElt = element.parentElement as Element;
  while (parentElt) {
    if (parentElt.tagName === 'LN' || parentElt.tagName === 'LN0') {
      path = [`${parentElt.tagName} ${identity(parentElt)}`].concat(path);
      break;
    }
    path = [`${parentElt.getAttribute('name')}`].concat(path);
    parentElt = parentElt.parentNode as Element;
  }

  const stringPath = path.join(' ');

  return stringPath
}

function renderDataModelSpan(key: Element) {
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

function findInstanceToRemove(element: Element) {
  const parent = element.parentElement as Element;
  const siblings = Array.from(parent.children).filter(
    child => child.tagName === element.tagName,
  );

  if (siblings.length > 1 || !['DAI', 'DOI'].includes(parent.tagName)) {
    return element;
  }

  return findInstanceToRemove(parent);
}

function getValues(instance: Element, dataModel: any) {
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
  const values = new Map<Element, any>();

  dataModel.forEach((value: any, key: any) => {
    if (childNames.includes(key.getAttribute('name'))) {
      values.set(
        key,
        getValues(
          children.find(
            child => child.getAttribute('name') === key.getAttribute('name'),
          ) as Element,
          value,
        ),
      );
    }
  });

  return values;
}

const cache = new WeakMap();

function getDataModel(dataType: Element, path: string[]) {
  // a datatype can have multiple paths
  const stringPath = path.join(' ');
  if (!cache.has(dataType)) {
    cache.set(dataType, new Set());
  }
  if (!cache.get(dataType).has(stringPath)) {
    cache.get(dataType).add(stringPath);
  }

  const children = Array.from(dataType.children).filter(child =>
    ['DO', 'DA', 'SDO', 'BDA'].includes(child.tagName),
  );
  const dataModel = new Map();

  for (const child of children) {
    if (!cache.has(child)) {
      cache.set(child, new Set());
    }
    const childStringPath = path
      .concat(child.getAttribute('name') as string)
      .join(' ');
    if (!cache.get(child).has(childStringPath)) {
      cache.get(child).add(childStringPath);
    }

    const childType = dataType
      ?.closest('DataTypeTemplates')
      ?.querySelector(`:scope > [id="${child.getAttribute('type')}"]`);
    if (childType)
      dataModel.set(
        child,
        getDataModel(
          childType,
          path.concat(child.getAttribute('name') as string),
        ),
      );
    else dataModel.set(child, new Map());
  }

  return dataModel;
}

export class IedEditor extends LitElement {
  @property({ type: Object }) doc?: Document;

  @property({ type: Object }) ied?: Element;

  @property({ type: String }) iedName = '';

  @property({ type: String }) searchTerm = '';

  @property({ type: Number }) editCount = 0;

  @property({ type: Number }) searchMode = 0;

  pathsToRender: string[] = [];

  instantiatePath(path: { name: string; tag: string }[], ln: Element) {
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
        nextInstance = this.doc?.createElementNS(
          ln.namespaceURI,
          path[i].tag,
        ) as Element;
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

  getTemplateValue(ln: Element, path: { name: string; tag: string }[]) {
    const template = this.doc?.querySelector(`:root > DataTypeTemplates`);
    const lnTemplate = template?.querySelector(
      `:scope > LNodeType[id="${ln.getAttribute('lnType')}"]`,
    );
    let nestedInst = lnTemplate?.querySelector(
      `:scope > *[name="${path[0].name}"]`,
    );

    for (let i = 1; i < path.length; i += 1) {
      const instType = nestedInst?.getAttribute('type');
      const instTemplate = template?.querySelector(
        `:scope > *[id="${instType}"]`,
      );
      nestedInst = instTemplate?.querySelector(
        `:scope > *[name="${path[i].name}"]`,
      );
    }

    if (nestedInst?.querySelector('Val')) {
      return nestedInst?.querySelector('Val')?.textContent;
    }

    return '';
  }

  getInstanceDescription(
    target: Element,
    host?: Element,
    path: { name: string; tag: string }[] = [],
  ) {
    // if the instance is in a path, check if it has a description in the IED
    let instantiatedDesc = '';
    if (path.length > 0 && host) {
      let childInstance = host.querySelector(
        `:scope > DOI[name="${path[0].name}"]`,
      );
      for (let i = 1; i < path.length && childInstance; i += 1) {
        childInstance = childInstance.querySelector(
          `:scope > *[name="${path[i].name}"]`,
        );
      }

      if (childInstance?.getAttribute('name') === target.getAttribute('name')) {
        instantiatedDesc = childInstance?.getAttribute('desc') ?? '';
      }
    }

    if (instantiatedDesc) {
      return html`<p class="desc">${instantiatedDesc}</p>`;
    }

    // check if the instance itself has a description
    if (target.getAttribute('desc')) {
      return html`<p class="desc">${target.getAttribute('desc')}</p>`;
    }

    // check if the template has a description
    const template = this.doc?.querySelector(`:root > DataTypeTemplates`);
    let instTemplate = null;
    if (target.nodeName === 'LN' || target.nodeName === 'LN0') {
      instTemplate = template?.querySelector(
        `:scope > LNodeType[id="${target.getAttribute('lnType')}"]`,
      );
    } else if (target.nodeName !== 'LDevice') {
      instTemplate = template?.querySelector(
        `:scope > *[id="${target.getAttribute('type')}"]`,
      );
    }

    if (instTemplate?.getAttribute('desc')) {
      return html`<p class="desc">${instTemplate?.getAttribute('desc')}</p>`;
    }

    return nothing;
  }

  updateValue(
    value: Element,
    ln: Element,
    path: { name: string; tag: string }[],
  ) {
    // start building distinct id for the mbg-value-input
    const parentLD = (ln.parentNode as Element)?.getAttribute('inst');
    const lnClass = ln.getAttribute('lnClass');
    const lnInst = ln.getAttribute('inst');
    let elementID = `${parentLD}-${lnClass}${lnInst}`;
    for (let i = 0; i < path.length; i += 1) {
      elementID += `-${path[i].name}`;
    }
    const input = this.shadowRoot?.getElementById(
      `${elementID}`,
    ) as HTMLInputElement;

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

  renderValueInput(
    value: Element,
    ln: Element,
    path: { name: string; tag: string }[],
  ) {
    const lnType = ln.getAttribute('lnType');

    // build distinct id for the mbg-value-input
    const parentLD = (ln.parentNode as Element)?.getAttribute('inst');
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
        ?.querySelector(
          `:root > DataTypeTemplates > LNodeType[id="${lnType}"] > DO[name="${parentDOName}"]`,
        )
        ?.getAttribute('type') as string;
    }

    // get the first DA instance from the parent DO
    let parentDAName = path[i].name;
    let parentDA = this.doc?.querySelector(
      `:root > DataTypeTemplates > DOType[id="${parentDOType}"] > DA[name="${parentDAName}"]`,
    );
    i += 1;

    // iterate through the path to get the most nested parent DA
    for (; i < path.length; i += 1) {
      const parentDAType = parentDA?.getAttribute('type');
      parentDAName = path[i].name;
      parentDA = this.doc?.querySelector(
        `:root > DataTypeTemplates > DAType[id="${parentDAType}"] > BDA[name="${parentDAName}"]`,
      );
    }

    // get the type of the most nested parent DA
    const bType = parentDA?.getAttribute('bType');

    // if it is an enum type, get the ordinal numbers and string labels
    if (bType === 'Enum') {
      const enumType = parentDA?.getAttribute('type');
      const enumTypeElement = this.doc?.querySelector(
        `:root > DataTypeTemplates > EnumType[id="${enumType}"]`,
      );

      const enumVals = enumTypeElement?.querySelectorAll('EnumVal') as NodeList;
      const enumOrdinals = Array.from(enumVals).map(enumVal =>
        (enumVal as Element).getAttribute('ord'),
      );
      const enumLabels = Array.from(enumVals).map(
        enumVal => enumVal.textContent,
      );

      return html`<mbg-val-input
        id="${elementID}"
        bType="${bType}"
        .enumOrdinals=${JSON.stringify(enumOrdinals)}
        .enumLabels=${JSON.stringify(enumLabels)}
        default="${value.textContent as string}"
      ></mbg-val-input>`;
    }

    return html`<mbg-val-input
      id="${elementID}"
      bType="${bType ?? ''}"
      default="${value.textContent as string}"
    ></mbg-val-input>`;
  }

  renderDataModel(
    dataModel: any,
    values: Map<Element, any>,
    ln: Element,
    path: { name: string; tag: string }[] = [],
    odd = false,
  ) {
    return dataModel
      .entries()
      .filter(
        ([key]: [Element]) =>
          !this.searchTerm ||
          this.pathsToRender.find(
            renderPath =>
              renderPath.startsWith(`${ln.tagName} ${identity(ln)}`) &&
              renderPath.includes(` ${key.getAttribute('name')}`),
          ),
      )
      .map(
        ([key, value]: [Element, Set<Element>]) =>
          html` <details
            class="${classMap({ odd })}"
            @toggle=${() => {
              this.requestUpdate();
            }}
          >
            <summary
              class="${classMap({
                instantiated: values?.has(key),
                uninitialized: value.size === 0 && !values?.get(key)?.length,
                'hide-marker':
                  Array.isArray(values?.get(key)) ||
                  (value.size === 0 && !values?.get(key)?.length),
              })}"
            >
              <div class="model-key-container">
                ${key.getAttribute('name')}
                ${value.size === 0 && !values?.get(key)?.length
                  ? html`<md-icon-button
                      @click=${() => {
                        const val = key.ownerDocument.createElementNS(
                          ln.namespaceURI,
                          'Val',
                        );
                        val.textContent = this.getTemplateValue(
                          ln,
                          path.concat([
                            {
                              name: key.getAttribute('name') ?? '',
                              tag: 'DAI',
                            },
                          ]),
                        ) as string;
                        const { parent, edits } = this.instantiatePath(
                          path.concat([
                            {
                              name: key.getAttribute('name') ?? '',
                              tag: 'DAI',
                            },
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
                ${Array.isArray(values?.get(key))
                  ? html`<div class="render-value-container">
                      ${this.renderValueInput(
                        values.get(key)[0],
                        ln,
                        path.concat([
                          {
                            name: key.getAttribute('name') ?? '',
                            tag: 'DAI',
                          },
                        ]),
                      )}

                      <div class="render-value-actions">
                        <md-icon-button
                          @click=${() =>
                            this.updateValue(
                              values.get(key)[0],
                              ln,
                              path.concat([
                                {
                                  name: key.getAttribute('name') ?? '',
                                  tag: 'DAI',
                                },
                              ]),
                            )}
                          ><md-icon>save</md-icon></md-icon-button
                        >
                        <md-icon-button
                          @click=${() => {
                            this.dispatchEvent(
                              new CustomEvent('oscd-edit', {
                                composed: true,
                                bubbles: true,
                                detail: {
                                  node: findInstanceToRemove(
                                    values.get(key)[0],
                                  ),
                                },
                              }),
                            );
                            // select the current element to get the parent details
                            const targetButton = this.shadowRoot
                              ?.activeElement as HTMLButtonElement;
                            // find the parent details
                            const target = targetButton.parentElement
                              ?.parentElement?.parentElement
                              ?.parentElement as HTMLDetailsElement;
                            // close details
                            target.removeAttribute('open');
                          }}
                          ><md-icon>delete</md-icon></md-icon-button
                        >
                      </div>
                    </div> `
                  : nothing}
              </div>

              ${renderDataModelSpan(key)}
            </summary>

            ${this.getInstanceDescription(
              key,
              ln,
              path.concat({
                name: key.getAttribute('name') ?? '',
                tag: ['DO', 'SDO'].includes(key.tagName) ? 'DOI' : 'DAI',
              }),
            )}

            <div
              ${ref(div => {
                if (!div?.parentElement?.hasAttribute('open')) return;

                render(
                  this.renderDataModel(
                    value,
                    values?.get(key),
                    ln,
                    path.concat({
                      name: key.getAttribute('name') ?? '',
                      tag: ['DO', 'SDO'].includes(key.tagName) ? 'DOI' : 'DAI',
                    }),
                    !odd,
                  ),
                  div as HTMLElement,
                );
              })}
            ></div>
          </details>`,
      );
  }

  renderLN(ln: Element) {
    const lnType = this.doc?.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${ln.getAttribute('lnType')}"]`,
    ) as Element;
    const path = [`${ln.tagName} ${identity(ln)}`];
    const dataModel = getDataModel(lnType, path);
    const values = getValues(ln, dataModel) as Map<Element, any>;
    return this.renderDataModel(dataModel, values, ln);
  }

  handleRadioChange(e: Event) {
    const selectedRadio = e.target as HTMLInputElement;
    if (selectedRadio) {
      const extensionType = selectedRadio.getAttribute('value') as string;
      this.searchMode = parseInt(extensionType, 10);
    }
  }

  resetSearch() {
    this.searchTerm = '';

    const searchInput = this.shadowRoot?.querySelector(
      '.search-input',
    ) as HTMLInputElement;
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
              @input=${(e: Event) => {
                this.searchTerm = (e.target as HTMLInputElement)?.value;
                const newPathsToRender: string[] = [];
                if (!this.ied || !this.doc) return;
                [
                  ...this.ied.querySelectorAll(
                    `${searchSelectorIED(this.searchTerm)}`,
                  ),
                  ...this.doc.querySelectorAll(
                    `${searchSelectorTemplates(this.searchTerm)}`,
                  ),
                ].forEach(element => {
                  if (['DOI', 'SDI', 'DAI'].includes(element.tagName)) {
                    const path = getInitializedEltPath(element);
                    if (!newPathsToRender.includes(path)) {
                      newPathsToRender.push(path);
                    }
                  }
                  cache.get(element)?.forEach((path: string) => {
                    if (!newPathsToRender.includes(path)) {
                      newPathsToRender.push(path);
                    }
                  });
                });
                this.pathsToRender = newPathsToRender;
                this.requestUpdate();
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
        </div>

        ${Array.from(
          this.ied?.querySelectorAll(':scope > AccessPoint > Server') ?? [],
        ).map(
          server =>
            html` <details class="odd" open>
              <summary>
                ${server.parentElement?.getAttribute('name')} Server
              </summary>
              ${Array.from(server.querySelectorAll(':scope > LDevice'))
                .filter(
                  ld =>
                    !this.searchTerm ||
                    this.pathsToRender.find(path =>
                      path.includes(identity(ld) as string),
                    ),
                )
                .map(
                  ld => html`
                    <details open>
                      <summary>
                        ${ld.getAttribute('inst')}
                        <span class="type">${ld.nodeName}</span>
                      </summary>
                      ${this.getInstanceDescription(ld)}
                      ${Array.from(
                        ld.querySelectorAll(':scope > LN0, :scope > LN'),
                      )
                        .filter(
                          ln =>
                            !this.searchTerm ||
                            this.pathsToRender.find(path =>
                              path.startsWith(`${ln.tagName} ${identity(ln)}`),
                            ),
                        )
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
                              ${this.getInstanceDescription(ln)}
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
      max-width: 100%;
    }

    details.odd {
      background: var(--oscd-base3);
      color: var(--oscd-base00);
    }

    summary {
      user-select: none;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      list-style: revert;
    }

    summary.instantiated {
      color: var(--oscd-primary);
      align-items: baseline;
    }

    summary.instantiated.hide-marker {
      padding: 0.5rem 0;
    }

    summary.instantiated > .model-key-container {
      align-items: baseline;
    }

    summary.uninitialized {
      pointer-events: none;
      list-style: none;
    }

    summary.uninitialized > .model-key-container > md-icon-button {
      pointer-events: auto;
    }

    summary.hide-marker {
      list-style: none;
    }

    summary.hide-marker::marker,
    summary.hide-marker::-webkit-details-marker {
      display: none;
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

    .model-key-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .render-value-container {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    md-icon-button {
      vertical-align: sub;
    }

    .ied-name md-icon-button,
    .search-field md-icon-button,
    details.odd > * > .model-key-container,
    details.odd > * > * > .model-key-container {
      --md-icon-button-hover-state-layer-color: var(--oscd-base2);
      --md-icon-button-hover-icon-color: var(--oscd-base01);
    }

    details:last-of-type[open] {
      padding-bottom: var(--mbg-ied-editor-spacing);
    }

    details.odd > * > .model-key-container mbg-val-input[bType='Quality'],
    details.odd > * > * > .model-key-container mbg-val-input[bType='Quality'],
    details.odd > * > .model-key-container mbg-val-input[bType='Currency'],
    details.odd > * > * > .model-key-container mbg-val-input[bType='Currency'],
    details.odd > * > .model-key-container mbg-val-input[bType='Enum'],
    details.odd > * > * > .model-key-container mbg-val-input[bType='Enum'] {
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

    .desc {
      margin: 8px 0;
      font-size: 18px;
      font-style: italic;
    }
  `;
}
