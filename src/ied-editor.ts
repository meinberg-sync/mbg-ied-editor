import { LitElement, html, css, nothing, render, TemplateResult } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { classMap } from 'lit/directives/class-map.js';
import { property, state } from 'lit/decorators.js';

import { Edit, identity } from '@openenergytools/scl-lib';
import {
  Insert,
  Remove,
  SetAttributes,
  SetTextContent,
} from '@omicronenergy/oscd-api';
import { newEditEventV2 } from '@omicronenergy/oscd-api/utils.js';

import {
  DataModel,
  Values,
  hasValues,
  getValues,
  getDataModel,
  getInitializedEltPath,
} from './utils/ied-data-model.js';

import type { EditField } from './components/edit-dialog.js';
import type { SearchChangedDetail } from './components/ied-search-filter.js';

import 'mbg-val-input/mbg-val-input.js';
import './components/alert-dialog.js';
import './components/edit-dialog.js';
import './components/ied-search-filter.js';

import '@material/web/textfield/filled-text-field.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';

function handleModelExpand(e: Event) {
  const button = e.target as HTMLButtonElement;
  const buttonIcon = button.querySelector('md-icon') as HTMLSpanElement;

  // toggle buttonIcon text
  const expandContent = buttonIcon.textContent === 'expand_all';
  buttonIcon.textContent = expandContent ? 'collapse_all' : 'expand_all';

  // get parent details
  let parent = button.parentElement;
  while (parent && parent.tagName !== 'DETAILS') {
    parent = parent.parentElement;
  }

  // open the parent details
  if (parent && !parent.hasAttribute('open')) {
    parent.toggleAttribute('open');
  }

  // toggle all child details
  const details = parent?.querySelectorAll('details');
  if (details) {
    for (const detail of details) {
      if (!detail.classList.contains('value-details')) {
        detail.toggleAttribute('open', expandContent);
      }
    }
  }
}

function getInputPath(
  ln: Element,
  path: { name: string; tag: string }[],
  sGroup: string,
) {
  const parentLD = (ln.parentNode as Element)?.getAttribute('inst');
  const lnClass = ln.getAttribute('lnClass');
  const lnInst = ln.getAttribute('inst');

  let elementID = `${parentLD}-${lnClass}${lnInst}`;
  for (let i = 0; i < path.length; i += 1) {
    elementID += `-${path[i].name}`;
    if (i === path.length - 1) elementID += sGroup;
  }

  return elementID;
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

  if (siblings.length > 1 || !['DOI', 'SDI', 'DAI'].includes(parent.tagName)) {
    return element;
  }

  return findInstanceToRemove(parent);
}

function getSGCB(ld: Element): Element | null {
  if (ld.querySelector(':scope > LN0 > SettingControl')) {
    return ld.querySelector(':scope > LN0 > SettingControl') as Element;
  }

  if (!ld.querySelector(':scope > LN0 > DOI[name="GrRef"]')) {
    return null;
  }

  const setSrcRef = ld.querySelector(
    ':scope > LN0 > DOI[name="GrRef"] > DAI[name="setSrcRef"] > Val',
  );
  const sgcbRef = setSrcRef?.textContent?.trim().replace(/^@/, '') ?? '';
  const ldRef = ld
    .closest('Server')!
    .querySelector(`:scope > LDevice[inst="${sgcbRef}"]`);

  return getSGCB(ldRef as Element);
}

function setTag(key: Element) {
  let tag = 'DAI';

  if (key.tagName === 'DO') {
    tag = 'DOI';
  } else if (key.tagName === 'SDO' || key.getAttribute('bType') === 'Struct') {
    tag = 'SDI';
  }

  return tag;
}

function isReadOnly(da: Element | null): boolean {
  if (!da) return false;

  const isKindRO = (da.getAttribute('valKind') as string) === 'RO';
  if (!da.getAttribute('valImport')) return isKindRO;

  const canImport = (da.getAttribute('valImport') as string) === 'false';
  return isKindRO && canImport;
}

export class IedEditor extends LitElement {
  @property({ type: Object }) doc?: Document;

  @property({ type: Object }) ied!: Element;

  @property({ type: String }) docName? = '';

  @property({ type: String }) searchTerm = '';

  @property({ type: Number }) editCount = 0;

  @property({ type: Array }) pathsToRender: string[] = [];

  @property({ type: Boolean }) loadingIED = false;

  @state() private pendingDeleteLN: Element | null = null;

  @state() private pendingDeleteFCDAs: Element[] = [];

  @state() private deleteDialogOpen = false;

  @state() private deleteDialogLD = '';

  @state() private deleteDialogMessage = '';

  @state() private deleteDialogItems: string[] = [];

  @state() private editDialogOpen = false;

  @state() private editDialogHeadline = '';

  @state() private editDialogFields: EditField[] = [];

  private pendingEditElement: Element | null = null;

  private pendingEditLN: Element | null = null;

  private pendingEditPath: { name: string; tag: string }[] = [];

  protected updated(changed: Map<string, unknown>) {
    super.updated?.(changed);

    if (changed.has('doc') || changed.has('docName') || changed.has('ied')) {
      this.pathsToRender = [];
      this.searchTerm = '';
      this.loadingIED = true;

      setTimeout(() => {
        this.loadingIED = false;
        this.requestUpdate();
      }, 1000);
    }
  }

  private handleSearchChanged(e: CustomEvent<SearchChangedDetail>) {
    this.searchTerm = e.detail.searchTerm;
    this.pathsToRender = e.detail.pathsToRender;
  }

  private instantiatePath(path: { name: string; tag: string }[], ln: Element) {
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

        const newEdit: Insert = {
          parent: instance,
          node: nextInstance,
          reference: null,
        };
        edits.push(newEdit);
      }
      instance = nextInstance;
    }

    return { parent: instance, edits };
  }

  private getTemplateValue(ln: Element, path: { name: string; tag: string }[]) {
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

  private getInstanceDescription(
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

  private getMostNestedElt(
    path: { name: string; tag: string }[],
    lnType: string,
  ): Element | null {
    let parentName = path[0].name;
    let parentElt = this.doc?.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${lnType}"] > DO[name="${parentName}"]`,
    );
    let parentType = parentElt?.getAttribute('type') as string;

    let i = 1;
    for (; i < path.length; i += 1) {
      parentName = path[i].name;
      parentElt = this.doc?.querySelector(
        `:root > DataTypeTemplates > *[id="${parentType}"] > *[name="${parentName}"]`,
      );

      if (i === path.length - 1) break;

      parentType = parentElt?.getAttribute('type') as string;
    }

    return parentElt ?? null;
  }

  private deleteLN(ln: Element) {
    const ldInst = (ln.parentNode as Element).getAttribute('inst') ?? '';
    const lnClass = ln.getAttribute('lnClass') ?? '';
    const lnInst = ln.getAttribute('inst') ?? '';
    const prefix = ln.getAttribute('prefix') ?? '';
    const lnIdentifier = `${lnClass}${lnInst}`;

    const referencingElements: string[] = [];
    Array.from(ln.parentElement?.querySelectorAll('* DAI') ?? []).forEach(
      elt => {
        if (
          elt?.querySelector('Val')?.textContent === `${ldInst}/${lnIdentifier}`
        ) {
          const eltPath = getInitializedEltPath(elt);
          const splitPath = eltPath.split(' ');
          referencingElements.push(`LN ${splitPath[2]}${splitPath[3]}`);
        }
      },
    );

    const matchingFcdas: Element[] = [];
    ln.closest('IED')
      ?.querySelectorAll('FCDA')
      .forEach(fcda => {
        if (
          fcda.getAttribute('ldInst') === ldInst &&
          fcda.getAttribute('lnClass') === lnClass &&
          (fcda.getAttribute('lnInst') ?? '') === lnInst &&
          (fcda.getAttribute('prefix') ?? '') === prefix
        ) {
          matchingFcdas.push(fcda);
          const datasetName = fcda.parentElement?.getAttribute('name') ?? '';
          const doName = fcda.getAttribute('doName') ?? '';
          const daName = fcda.getAttribute('daName');
          const doRef = daName ? `${doName}.${daName}` : doName;
          referencingElements.push(`FCDA ${doRef} in DataSet '${datasetName}'`);
        }
      });

    this.pendingDeleteLN = ln;
    this.pendingDeleteFCDAs = matchingFcdas;
    this.deleteDialogLD = ldInst;
    this.deleteDialogMessage = `Are you sure you want to delete logical node <strong>${lnIdentifier}</strong>?`;
    this.deleteDialogItems = referencingElements;
    this.deleteDialogOpen = true;
  }

  private handleDeleteConfirm() {
    if (!this.pendingDeleteLN) return;

    const edits: Remove[] = [
      { node: this.pendingDeleteLN },
      ...this.pendingDeleteFCDAs.map(fcda => ({ node: fcda })),
    ];
    this.dispatchEvent(newEditEventV2(edits));

    this.pendingDeleteLN = null;
    this.pendingDeleteFCDAs = [];
    this.deleteDialogOpen = false;
  }

  private openEditDialog(
    element: Element,
    ln?: Element,
    path?: { name: string; tag: string }[],
  ) {
    this.pendingEditElement = element;
    const get = (attr: string) => element.getAttribute(attr) ?? '';

    if (element.tagName === 'LN0') {
      this.editDialogHeadline = `Edit ${get('lnClass') || 'LLN0'}`;
      this.editDialogFields = [
        { label: 'Description', attribute: 'desc', value: get('desc') },
      ];
    } else if (element.tagName === 'LN') {
      const lnClass = get('lnClass');
      const siblings = Array.from(
        element.parentElement!.querySelectorAll(`LN[lnClass="${lnClass}"]`),
      ).filter(sibling => sibling !== element);

      this.editDialogHeadline = `Edit LN ${get('prefix')}${get('lnClass')}${get('inst')}`;
      this.editDialogFields = [
        { label: 'Description', attribute: 'desc', value: get('desc') },
        { label: 'Prefix', attribute: 'prefix', value: get('prefix') },
        {
          label: 'Instance',
          attribute: 'inst',
          value: get('inst'),
          validate: (value: string) =>
            siblings.some(s => s.getAttribute('inst') === value)
              ? `Instance ${value} of ${lnClass} already exists!`
              : null,
        },
      ];
    } else if (element.tagName === 'LDevice') {
      this.editDialogHeadline = `Edit LDevice ${get('inst')}`;
      this.editDialogFields = [
        { label: 'Description', attribute: 'desc', value: get('desc') },
        { label: 'LD Name', attribute: 'ldName', value: get('ldName') },
      ];
    } else if (element.tagName === 'AccessPoint') {
      this.editDialogHeadline = `Edit Access Point ${get('name')}`;
      this.editDialogFields = [
        {
          label: 'Name',
          attribute: 'name',
          value: get('name'),
          validate: (value: string) =>
            value.trim() === ''
              ? 'The Access Point name cannot be empty!'
              : null,
        },
        { label: 'Description', attribute: 'desc', value: get('desc') },
      ];
    } else if (['DO', 'SDO', 'DA', 'BDA'].includes(element.tagName)) {
      this.pendingEditElement = null;
      this.pendingEditLN = ln ?? null;
      this.pendingEditPath = path ?? [];

      let currentDesc = '';
      if (ln && path && path.length > 0) {
        let instance: Element | null = ln.querySelector(
          `:scope > DOI[name="${path[0].name}"]`,
        );
        for (let i = 1; i < path.length && instance; i += 1) {
          instance = instance.querySelector(
            `:scope > *[name="${path[i].name}"]`,
          );
        }
        currentDesc = instance?.getAttribute('desc') ?? '';
      }

      this.editDialogHeadline = `Edit ${get('name')}`;
      this.editDialogFields = [
        { label: 'Description', attribute: 'desc', value: currentDesc },
      ];
    }

    this.editDialogOpen = true;
  }

  private handleEditSave(e: CustomEvent<Record<string, string>>) {
    if (this.pendingEditLN && this.pendingEditPath.length > 0) {
      const desc = e.detail.desc?.trim() || null;

      if (!desc) {
        let instance: Element | null = this.pendingEditLN.querySelector(
          `:scope > DOI[name="${this.pendingEditPath[0].name}"]`,
        );
        for (let i = 1; i < this.pendingEditPath.length && instance; i += 1) {
          instance = instance.querySelector(
            `:scope > *[name="${this.pendingEditPath[i].name}"]`,
          );
        }
        if (instance?.hasAttribute('desc')) {
          this.dispatchEvent(
            newEditEventV2([{ element: instance, attributes: { desc: null } }]),
          );
        }
      } else {
        const { parent, edits } = this.instantiatePath(
          this.pendingEditPath,
          this.pendingEditLN,
        );
        const setDesc: SetAttributes = {
          element: parent,
          attributes: { desc },
        };
        this.dispatchEvent(newEditEventV2([...edits, setDesc]));
      }

      this.pendingEditLN = null;
      this.pendingEditPath = [];
      this.editDialogOpen = false;
      return;
    }

    if (!this.pendingEditElement) return;

    const attributes: Record<string, string | null> = {};
    for (const [attr, value] of Object.entries(e.detail)) {
      attributes[attr] = value.trim() || null;
    }

    const edit: SetAttributes = {
      element: this.pendingEditElement,
      attributes,
    };
    this.dispatchEvent(newEditEventV2([edit]));

    this.pendingEditElement = null;
    this.editDialogOpen = false;
  }

  private updateValue(
    value: Element,
    ln: Element,
    path: { name: string; tag: string }[],
    index: string = '',
  ) {
    const elementID = getInputPath(ln, path, index);
    const input = this.shadowRoot?.getElementById(
      `${elementID}`,
    ) as HTMLInputElement;

    const { edits } = this.instantiatePath(path, ln);
    const editVal: SetTextContent = {
      element: value,
      textContent: input.value,
    };
    this.dispatchEvent(newEditEventV2([...edits, editVal]));
    this.requestUpdate();
  }

  private addValue(
    ln: Element,
    path: { name: string; tag: string }[],
    setValue: string,
    sGroup?: string,
  ) {
    const val = ln.ownerDocument.createElementNS(
      ln.namespaceURI,
      'Val',
    ) as Element;
    if (sGroup) val.setAttribute('sGroup', sGroup);
    val.textContent = setValue;

    const { parent, edits } = this.instantiatePath(path, ln);
    const newVal: Insert = {
      parent,
      node: val,
      reference: null,
    };

    this.dispatchEvent(newEditEventV2([...edits, newVal]));
    this.requestUpdate();
  }

  private addValues(
    ln: Element,
    da: Element,
    path: { name: string; tag: string }[],
    numOfSGs: number,
  ) {
    const isSettingAttr = ['SG', 'SE'].includes(
      da.getAttribute('fc') as string,
    );
    if (!isSettingAttr) {
      this.addValue(ln, path, this.getTemplateValue(ln, path) as string);
      return;
    }

    for (let i = 1; i <= numOfSGs; i += 1) {
      this.addValue(
        ln,
        path,
        this.getTemplateValue(ln, path) as string,
        i.toString(),
      );
    }
  }

  private addMissingValues(
    ln: Element,
    path: { name: string; tag: string }[],
    actSGValue: Element,
    numOfSGs: number,
  ) {
    const { parent, edits } = this.instantiatePath(path, ln);
    const values = Array.from(parent.querySelectorAll(':scope > Val'));

    const editMissingValues: Edit[] = edits;
    for (let i = 1; i <= numOfSGs; i += 1) {
      const val = values.find(
        v =>
          v.getAttribute('sGroup') === i.toString() ||
          (!v.hasAttribute('sGroup') && i === 1),
      );
      if (!val) {
        const node = ln.ownerDocument.createElementNS(
          ln.namespaceURI,
          'Val',
        ) as Element;
        node.setAttribute('sGroup', i.toString());
        node.textContent = actSGValue.textContent;
        editMissingValues.push({
          parent,
          node,
          reference: null,
        });
      } else if (val.getAttribute('sGroup') !== i.toString()) {
        editMissingValues.push({
          element: val,
          attributes: { sGroup: i.toString() },
        });
      }
    }

    this.dispatchEvent(newEditEventV2(editMissingValues));
  }

  private renderValueInputField(
    value: Element,
    ln: Element,
    path: { name: string; tag: string }[],
    readOnly: boolean,
    index: string = '',
    isActSG: boolean = false,
  ) {
    const sGroup = value.getAttribute('sGroup') || '';
    const label = isActSG ? `Val ${sGroup} (actSG)` : `Val ${sGroup ?? ''}`;
    const elementID = getInputPath(ln, path, sGroup || index);
    const parentDA = this.getMostNestedElt(
      path,
      ln.getAttribute('lnType') as string,
    );
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
        label="${label}"
        ?readOnly="${readOnly}"
      ></mbg-val-input>`;
    }

    return html`<mbg-val-input
      id="${elementID}"
      bType="${bType ?? ''}"
      default="${value.textContent as string}"
      label="${label}"
      ?readOnly="${readOnly}"
    ></mbg-val-input>`;
  }

  private renderValues(
    values: Element[],
    ln: Element,
    numOfSGs: number,
    actSG: number,
    path: { name: string; tag: string }[],
  ) {
    const parentDA = this.getMostNestedElt(
      path,
      ln.getAttribute('lnType') as string,
    );
    const parentFC = parentDA?.getAttribute('fc') as string;
    const readOnly =
      isReadOnly(parentDA) || isReadOnly(values[0].parentElement);

    if (numOfSGs === 0 || !['SG', 'SE'].includes(parentFC)) {
      return html` <div class="render-values">
        <div class="render-value-container">
          ${this.renderValueInputField(values[0], ln, path, readOnly)}
          ${readOnly
            ? nothing
            : html` <div class="render-value-actions">
                <md-icon-button
                  @click=${() => this.updateValue(values[0], ln, path)}
                  ><md-icon>save</md-icon></md-icon-button
                >
                <md-icon-button
                  @click=${() => {
                    const removeVal: Remove = {
                      node: findInstanceToRemove(values[0]),
                    };
                    this.dispatchEvent(newEditEventV2(removeVal));
                    this.requestUpdate();
                  }}
                  ><md-icon>delete</md-icon></md-icon-button
                >
              </div>`}
        </div>
      </div>`;
    }

    const valueContainers: TemplateResult[] = [];

    const activeValue =
      values.find(
        val =>
          parseInt(val?.getAttribute('sGroup')?.trim() ?? '0', 10) === actSG,
      ) ?? values[0];

    for (let i = 1; i <= numOfSGs; i += 1) {
      let value = values.find(
        val => parseInt(val?.getAttribute('sGroup')?.trim() ?? '0', 10) === i,
      );

      if (values.length === 1 && !value?.hasAttribute('sGroup')) {
        [value] = values;
      }

      valueContainers.push(
        value
          ? html`
              <div class="render-value-container">
                ${this.renderValueInputField(
                  value,
                  ln,
                  path,
                  readOnly,
                  i.toString(),
                  value === activeValue,
                )}
                ${readOnly
                  ? nothing
                  : html`<div class="render-value-actions">
                      <md-icon-button
                        @click=${() => {
                          this.addMissingValues(
                            ln,
                            path,
                            activeValue,
                            numOfSGs,
                          );
                          const val = Array.from(
                            value.parentElement?.children ?? [],
                          ).find(
                            v =>
                              v.getAttribute('sGroup') === i.toString() ||
                              (!v.hasAttribute('sGroup') && i === 1),
                          );
                          if (val)
                            this.updateValue(val, ln, path, i.toString());
                        }}
                        ><md-icon>save</md-icon></md-icon-button
                      >
                      ${value === activeValue
                        ? html`<md-icon-button
                            @click=${() => {
                              this.addMissingValues(
                                ln,
                                path,
                                activeValue,
                                numOfSGs,
                              );
                              for (const val of values) {
                                const removeVal: Remove = {
                                  node: findInstanceToRemove(val),
                                };
                                this.dispatchEvent(newEditEventV2(removeVal));
                              }
                              this.requestUpdate();
                            }}
                            ><md-icon>delete_sweep</md-icon></md-icon-button
                          > `
                        : html`<md-icon-button
                            @click=${() => {
                              value!.textContent =
                                activeValue?.textContent as string;
                              const input = this.shadowRoot!.getElementById(
                                `${getInputPath(ln, path, i.toString())}`,
                              ) as HTMLInputElement;
                              if (input)
                                input.value =
                                  activeValue?.textContent as string;
                              this.updateValue(value, ln, path, i.toString());
                            }}
                            ?disabled=${value.textContent ===
                            activeValue?.textContent}
                          >
                            <md-icon>sync</md-icon>
                          </md-icon-button>`}
                    </div>`}
              </div>
            `
          : html`
              <div class="render-value-container">
                <p class="value-error">
                  Missing value for SG ${i}
                  <md-icon-button
                    @click=${() => {
                      this.addValue(
                        ln,
                        path,
                        (this.getTemplateValue(ln, path) as string) ||
                          (activeValue?.textContent as string),
                        i.toString(),
                      );
                    }}
                    ><md-icon>add</md-icon></md-icon-button
                  >
                </p>
              </div>
            `,
      );
    }

    return html` <div class="render-values">${valueContainers}</div> `;
  }

  private renderDataModel(
    dataModel: DataModel,
    values: Values | undefined,
    ln: Element,
    numOfSGs: number,
    actSG: number,
    path: { name: string; tag: string }[] = [],
    odd = false,
  ) {
    return Array.from(dataModel.entries())
      .filter(
        ([key]: [Element, DataModel]) =>
          !this.searchTerm ||
          this.pathsToRender.find(
            renderPath =>
              renderPath.startsWith(`${ln.tagName} ${identity(ln)}`) &&
              renderPath.includes(` ${key.getAttribute('name')}`),
          ),
      )
      .map(
        ([key, value]: [Element, DataModel]) =>
          html` <details
            class="${classMap({
              odd,
              'value-details':
                Array.isArray(values?.get(key)) || value.size === 0,
            })}"
            @toggle=${() => {
              this.requestUpdate();
            }}
          >
            <summary
              class="${classMap({
                instantiated: !!values?.has(key),
                uninitialized: value.size === 0 && !hasValues(values?.get(key)),
                'hide-marker':
                  Array.isArray(values?.get(key)) || value.size === 0,
              })}"
              @click=${(e: Event) => {
                if (Array.isArray(values?.get(key)) || value.size === 0) {
                  e.preventDefault();
                }
              }}
            >
              <div
                class="${classMap({
                  'model-key-container': true,
                  'has-values': Array.isArray(values?.get(key)),
                })}"
              >
                ${key.getAttribute('name')}
                ${value.size === 0 && !hasValues(values?.get(key))
                  ? html`<md-icon-button
                      @click=${() => {
                        this.addValues(
                          ln,
                          key,
                          path.concat([
                            {
                              name: key.getAttribute('name') ?? '',
                              tag: 'DAI',
                            },
                          ]),
                          numOfSGs,
                        );
                      }}
                      ><md-icon>add</md-icon></md-icon-button
                    >`
                  : nothing}
                ${Array.isArray(values?.get(key))
                  ? this.renderValues(
                      values.get(key) as Element[],
                      ln,
                      numOfSGs,
                      actSG,
                      path.concat([
                        {
                          name: key.getAttribute('name') ?? '',
                          tag: 'DAI',
                        },
                      ]),
                    )
                  : nothing}
              </div>

              <div class="model-details">
                ${renderDataModelSpan(key)}
                <div class="model-actions">
                  <md-icon-button
                    @click=${() =>
                      this.openEditDialog(
                        key,
                        ln,
                        path.concat({
                          name: key.getAttribute('name') ?? '',
                          tag: setTag(key),
                        }),
                      )}
                    ><md-icon>edit</md-icon></md-icon-button
                  >
                  ${['DO', 'SDO'].includes(key.tagName) ||
                  (['DA', 'BDA'].includes(key.tagName) && value.size > 0)
                    ? html`
                        <md-icon-button @click=${handleModelExpand}
                          ><md-icon>expand_all</md-icon></md-icon-button
                        >
                      `
                    : nothing}
                </div>
              </div>
            </summary>

            ${this.getInstanceDescription(
              key,
              ln,
              path.concat({
                name: key.getAttribute('name') ?? '',
                tag: setTag(key),
              }),
            )}

            <div
              ${ref(div => {
                if (!div?.parentElement?.hasAttribute('open')) return;

                render(
                  this.renderDataModel(
                    value,
                    values?.get(key) as Values | undefined,
                    ln,
                    numOfSGs,
                    actSG,
                    path.concat({
                      name: key.getAttribute('name') ?? '',
                      tag: setTag(key),
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

  private renderLN(ln: Element, numOfSGs: number, actSG: number) {
    const lnType = this.doc?.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${ln.getAttribute('lnType')}"]`,
    ) as Element;
    if (!lnType) return nothing;

    const path = [`${ln.tagName} ${identity(ln)}`];
    const dataModel = getDataModel(lnType, path);
    const values = getValues(ln, dataModel) as Values;
    return this.renderDataModel(dataModel, values, ln, numOfSGs, actSG);
  }

  private renderLDevice(ld: Element) {
    const sgcb = getSGCB(ld);
    const numOfSGs = parseInt(
      sgcb?.getAttribute('numOfSGs')?.trim() ?? '0',
      10,
    );
    const actSG = parseInt(sgcb?.getAttribute('actSG')?.trim() ?? '0', 10);

    return html`
      <details
        class="${classMap({
          'ldevice-details':
            Array.from(
              ld.closest('Server')!.querySelectorAll(':scope > LDevice'),
            ).length > 1,
        })}"
        open
      >
        <summary>
          ${ld.getAttribute('inst')}
          <div class="model-details">
            <span class="type">${ld.nodeName}</span>
            <div class="model-actions">
              <md-icon-button @click=${() => this.openEditDialog(ld)}
                ><md-icon>edit</md-icon></md-icon-button
              >
              <md-icon-button @click=${handleModelExpand}
                ><md-icon>expand_all</md-icon></md-icon-button
              >
            </div>
          </div>
        </summary>
        ${this.getInstanceDescription(ld)}
        ${Array.from(ld.querySelectorAll(':scope > LN0, :scope > LN'))
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
                  <div class="model-details">
                    <div>
                      <span class="type">
                        ${ln.nodeName}
                        <span class="subtype"
                          >(${ln.getAttribute('lnType')})</span
                        >
                      </span>
                    </div>
                    <div class="model-actions">
                      ${['LN'].includes(ln.tagName)
                        ? html`
                            <md-icon-button @click=${() => this.deleteLN(ln)}
                              ><md-icon>delete</md-icon></md-icon-button
                            >
                          `
                        : nothing}
                      <md-icon-button @click=${() => this.openEditDialog(ln)}
                        ><md-icon>edit</md-icon></md-icon-button
                      >
                      <md-icon-button @click=${handleModelExpand}
                        ><md-icon>expand_all</md-icon></md-icon-button
                      >
                    </div>
                  </div>
                </summary>
                ${this.getInstanceDescription(ln)}
                ${this.renderLN(ln, numOfSGs, actSG)}
              </details>
            `,
          )}
      </details>
    `;
  }

  render() {
    return html`
      <mbg-edit-dialog
        .headline=${this.editDialogHeadline}
        .fields=${this.editDialogFields}
        .open=${this.editDialogOpen}
        @save=${this.handleEditSave}
        @cancel=${() => {
          this.editDialogOpen = false;
          this.pendingEditElement = null;
          this.pendingEditLN = null;
          this.pendingEditPath = [];
        }}
        @closed=${() => {
          this.editDialogOpen = false;
          this.pendingEditElement = null;
          this.pendingEditLN = null;
          this.pendingEditPath = [];
        }}
      ></mbg-edit-dialog>

      <mbg-alert-dialog
        headline="Delete Logical Node"
        confirmText="Delete"
        confirmAction="delete"
        .ld=${this.deleteDialogLD}
        .message=${this.deleteDialogMessage}
        .items=${this.deleteDialogItems}
        .open=${this.deleteDialogOpen}
        @confirm=${this.handleDeleteConfirm}
        @cancel=${() => {
          this.deleteDialogOpen = false;
          this.pendingDeleteLN = null;
        }}
        @closed=${() => {
          this.deleteDialogOpen = false;
          this.pendingDeleteLN = null;
        }}
      ></mbg-alert-dialog>

      ${this.loadingIED
        ? html`<main>
            <div class="loading-container">
              <md-circular-progress
                four-color
                indeterminate
              ></md-circular-progress>
            </div>
          </main>`
        : html`<main>
            <ied-search-filter
              .doc=${this.doc}
              .ied=${this.ied}
              @search-changed=${this.handleSearchChanged}
            ></ied-search-filter>

            ${Array.from(
              this.ied?.querySelectorAll(':scope > AccessPoint > Server') ?? [],
            ).map(
              server =>
                html` <details class="odd" open>
                  <summary>
                    ${server.parentElement?.getAttribute('name')} Server
                    <div class="model-details">
                      <div class="model-actions">
                        <md-icon-button
                          @click=${() =>
                            this.openEditDialog(server.parentElement!)}
                          ><md-icon>edit</md-icon></md-icon-button
                        >
                        <md-icon-button @click=${handleModelExpand}
                          ><md-icon>expand_all</md-icon></md-icon-button
                        >
                      </div>
                    </div>
                  </summary>
                  ${this.getInstanceDescription(server.parentElement!)}
                  ${Array.from(server.querySelectorAll(':scope > LDevice'))
                    .filter(
                      ld =>
                        !this.searchTerm ||
                        this.pathsToRender.find(path =>
                          path.includes(identity(ld) as string),
                        ),
                    )
                    .map(ld => this.renderLDevice(ld))}
                </details>`,
            )}
          </main>`}
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

      --md-outlined-icon-button-size: 24px;
      --md-outlined-icon-button-container-shape: 10px;

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
      margin-top: 1rem;
    }

    main > details {
      width: max-content;
    }

    details:first-of-type {
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
    }

    details:last-of-type {
      border-bottom-left-radius: 10px;
      border-bottom-right-radius: 10px;
    }

    md-filled-text-field {
      width: 300px;
    }

    details {
      padding: 0 var(--mbg-ied-editor-spacing);
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

    details.ldevice-details {
      margin-bottom: var(--mbg-ied-editor-spacing);
    }

    details.ldevice-details[open] {
      padding: var(--mbg-ied-editor-spacing);
      padding-top: 0;
    }

    details.ldevice-details:last-of-type {
      margin-bottom: 0;
    }

    details:not(.ldevice-details):last-of-type[open] {
      padding-bottom: var(--mbg-ied-editor-spacing);
    }

    summary {
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      list-style: revert;
    }

    summary.instantiated {
      color: var(--oscd-primary);
    }

    summary.instantiated.hide-marker {
      padding: 0.5rem 0;
    }

    summary.instantiated > .model-key-container.has-values {
      align-items: center;
    }

    summary.uninitialized {
      pointer-events: none;
      list-style: none;
    }

    summary.uninitialized md-icon-button {
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
    }

    span.subtype {
      font-size: 13px;
    }

    summary:hover {
      font-weight: bold;
    }

    details:hover > summary span.type {
      opacity: 0.7;
      transition: opacity 0.2s cubic-bezier(0, 0.9, 0.45, 1);
    }

    ul {
      margin: 0px;
      list-style-type: none;
      padding: 10px 0px;
    }

    .model-details {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .model-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .model-key-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .render-values .render-value-container:not(:first-of-type) {
      margin-top: 0.5rem;
    }

    .render-value-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .render-value-actions {
      display: flex;
      align-items: center;
    }

    .value-error {
      color: var(--oscd-error);
      font-weight: bold;
      margin: inherit;
    }

    .ied-name md-icon-button,
    .search-field md-icon-button,
    details.odd > summary .model-details,
    details.odd > * > .model-key-container,
    details.odd > * > * > .model-key-container {
      --md-icon-button-hover-state-layer-color: var(--oscd-base2);
      --md-icon-button-hover-icon-color: var(--oscd-base01);
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
      font-size: 16px;
      font-style: italic;
    }
  `;
}
