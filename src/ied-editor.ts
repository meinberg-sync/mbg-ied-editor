import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { keyed } from 'lit/directives/keyed.js';
import { classMap } from 'lit/directives/class-map.js';
import { property, state } from 'lit/decorators.js';

import { identity } from '@openenergytools/scl-lib';
import { newEditEventV2 } from '@omicronenergy/oscd-api/utils.js';

import {
  DataModel,
  Values,
  hasValues,
  getValues,
  getDataModel,
  getTypeIndex,
} from './utils/ied-data-model.js';

import {
  getInputPath,
  getInstanceDescription,
  getMostNestedElement,
  getSGCB,
  getTemplateDescription,
  getTemplateValue,
  isReadOnly,
  setTag,
} from './utils/ied-scl.js';

import {
  buildDeleteLNEdits,
  buildUpdateValueEdits,
  buildAddValueEdits,
  buildAddValuesEdits,
  buildMissingValuesEdits,
  buildRemoveValueEdits,
  buildRemoveAllValuesEdits,
  buildInstanceDescEdits,
  buildAttributeEdits,
} from './utils/ied-edits.js';

import {
  lnPath,
  collectExpandablePaths,
  findLNReferences,
} from './utils/ln-model.js';

import type { EditField } from './components/edit-dialog.js';
import type { SearchChangedDetail } from './components/ied-search-filter.js';

import 'mbg-val-input/mbg-val-input.js';
import './components/alert-dialog.js';
import './components/edit-dialog.js';
import './components/ied-search-filter.js';

import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';

function toggleExpandButton(button: HTMLElement): boolean {
  const buttonIcon = button.querySelector('md-icon') as HTMLSpanElement;
  const expandContent = buttonIcon.textContent === 'expand_all';
  buttonIcon.textContent = expandContent ? 'collapse_all' : 'expand_all';
  button.setAttribute(
    'aria-label',
    expandContent ? 'Collapse all' : 'Expand all',
  );
  return expandContent;
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

function renderReadOnlyIndicator() {
  return html`<div
    class="render-value-actions read-only-indicator"
    title="This value is read-only (valKind is RO)"
  >
    <md-icon role="img" aria-label="read-only">lock</md-icon>
  </div>`;
}

export class IedEditor extends LitElement {
  @property({ type: Object }) doc?: Document;

  @property({ type: Object }) ied!: Element;

  @property({ type: String }) docName? = '';

  @property({ type: String }) searchTerm = '';

  @property({ type: Number }) editCount = 0;

  @property({ type: Array }) pathsToRender: string[] = [];

  @state() private scopeActive = false;

  @state() private pendingDeleteLN: Element | null = null;

  @state() private pendingDeleteFCDAs: Element[] = [];

  @state() private deleteDialogOpen = false;

  @state() private deleteDialogLD = '';

  @state() private deleteDialogMessage = '';

  @state() private deleteDialogItems: string[] = [];

  @state() private dirtyInputs: Set<string> = new Set();

  @state() private editDialogOpen = false;

  @state() private editDialogHeadline = '';

  @state() private editDialogFields: EditField[] = [];

  @state() private openPaths: Set<string> = new Set();

  private pendingEditElement: Element | null = null;

  private pendingEditLN: Element | null = null;

  private pendingEditPath: { name: string; tag: string }[] = [];

  private typeIndex?: Map<string, Element>;

  private dataModels = new Map<Element, DataModel>();

  protected willUpdate(changed: Map<string, unknown>) {
    super.willUpdate?.(changed);

    if (changed.has('doc') || changed.has('ied') || changed.has('editCount')) {
      this.typeIndex = undefined;
      this.dataModels = new Map();
    }

    if (changed.has('doc') || changed.has('docName') || changed.has('ied')) {
      this.pathsToRender = [];
      this.searchTerm = '';
      this.scopeActive = false;
      this.dirtyInputs = new Set();
      this.openPaths = new Set();
    }
  }

  private get dataTypeTemplates(): Element {
    return this.doc?.querySelector(`:root > DataTypeTemplates`) as Element;
  }

  private get types(): Map<string, Element> {
    this.typeIndex ??= getTypeIndex(this.dataTypeTemplates);
    return this.typeIndex;
  }

  private getLNModel(ln: Element): DataModel | undefined {
    const lnType = this.types.get(ln.getAttribute('lnType') ?? '');
    if (lnType?.tagName !== 'LNodeType') return undefined;

    let dataModel = this.dataModels.get(lnType);
    if (!dataModel) {
      dataModel = getDataModel(lnType, [lnPath(ln)], this.types);
      this.dataModels.set(lnType, dataModel);
    }

    return dataModel;
  }

  private lnExpandPaths(lns: Element[], maxDepth = Infinity): string[] {
    return lns.flatMap(ln => {
      const dataModel = this.getLNModel(ln);
      return [
        lnPath(ln),
        ...(dataModel
          ? collectExpandablePaths(dataModel, lnPath(ln), maxDepth)
          : []),
      ];
    });
  }

  private handleExpandAll(e: Event, paths: string[], ownPath?: string) {
    e.preventDefault();

    const button = e.currentTarget as HTMLElement;
    const expand = toggleExpandButton(button);

    const details = button.closest('details');
    if (details && !details.open) {
      details.open = true;
    }

    if (!ownPath) {
      details
        ?.querySelectorAll(':scope > details:not(.odd)')
        .forEach(child => child.toggleAttribute('open', expand));
    }

    const openPaths = new Set(this.openPaths);
    paths.forEach(path =>
      expand ? openPaths.add(path) : openPaths.delete(path),
    );
    if (ownPath) {
      openPaths.add(ownPath);
    }

    this.openPaths = openPaths;
  }

  private handleToggle(e: Event, path: string) {
    if (e.target !== e.currentTarget) return;

    const { open } = e.currentTarget as HTMLDetailsElement;
    if (this.openPaths.has(path) === open) return;

    const openPaths = new Set(this.openPaths);
    if (open) {
      openPaths.add(path);
    } else {
      openPaths.delete(path);
    }

    this.openPaths = openPaths;
  }

  private handleSearchChanged(e: CustomEvent<SearchChangedDetail>) {
    this.searchTerm = e.detail.searchTerm;
    this.pathsToRender = e.detail.pathsToRender;
    this.scopeActive = e.detail.scopeActive;
  }

  private handleValueInput(e: Event, valueElement: Element) {
    const input = e.currentTarget as HTMLElement & {
      value: string;
      id: string;
    };
    const dirty = new Set(this.dirtyInputs);

    if (input.value !== valueElement.textContent) {
      dirty.add(input.id);
    } else {
      dirty.delete(input.id);
    }

    this.dirtyInputs = dirty;
  }

  private clearDirty(...ids: string[]) {
    const dirty = new Set(this.dirtyInputs);
    ids.forEach(id => dirty.delete(id));
    this.dirtyInputs = dirty;
  }

  private deleteLN(ln: Element) {
    const lnReferences = findLNReferences(ln);
    const lnClass = ln.getAttribute('lnClass') ?? '';
    const lnInst = ln.getAttribute('inst') ?? '';

    this.pendingDeleteLN = ln;
    this.pendingDeleteFCDAs = lnReferences.fcdas;
    this.deleteDialogLD = (ln.parentNode as Element).getAttribute('inst') ?? '';
    this.deleteDialogMessage = `Are you sure you want to delete logical node <strong>${lnClass}${lnInst}</strong>?`;
    this.deleteDialogItems = lnReferences.labels;
    this.deleteDialogOpen = true;
  }

  private handleDeleteConfirm() {
    if (!this.pendingDeleteLN) return;

    this.dispatchEvent(
      newEditEventV2(
        buildDeleteLNEdits(this.pendingDeleteLN, this.pendingDeleteFCDAs),
      ),
    );

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

      this.dispatchEvent(
        newEditEventV2(
          buildInstanceDescEdits(
            this.pendingEditLN,
            this.pendingEditPath,
            desc ?? '',
          ),
        ),
      );

      this.pendingEditLN = null;
      this.pendingEditPath = [];
      this.editDialogOpen = false;
      return;
    }

    if (!this.pendingEditElement) return;

    this.dispatchEvent(
      newEditEventV2(buildAttributeEdits(this.pendingEditElement, e.detail)),
    );

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

    this.dispatchEvent(
      newEditEventV2(buildUpdateValueEdits(ln, path, value, input.value)),
    );
    this.clearDirty(elementID);
    this.requestUpdate();
  }

  private addValue(
    ln: Element,
    path: { name: string; tag: string }[],
    setValue: string,
    sGroup?: string,
  ) {
    this.dispatchEvent(
      newEditEventV2(buildAddValueEdits(ln, path, setValue, sGroup)),
    );
    this.requestUpdate();
  }

  private addValues(
    ln: Element,
    da: Element,
    path: { name: string; tag: string }[],
    numOfSGs: number,
  ) {
    this.dispatchEvent(
      newEditEventV2(
        buildAddValuesEdits(this.dataTypeTemplates, ln, da, path, numOfSGs),
      ),
    );
    this.requestUpdate();
  }

  private renderDescription(
    target: Element,
    host?: Element,
    path: { name: string; tag: string }[] = [],
  ) {
    const desc =
      getInstanceDescription(target, host, path) ||
      getTemplateDescription(this.dataTypeTemplates, target);
    if (desc) {
      return html`<p class="desc">${desc}</p>`;
    }

    return nothing;
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
    const parentDA = getMostNestedElement(
      this.dataTypeTemplates,
      ln.getAttribute('lnType') as string,
      path,
    );
    const bType = parentDA?.getAttribute('bType');

    // if it is an enum type, get the ordinal numbers and string labels
    if (bType === 'Enum') {
      const enumType = parentDA?.getAttribute('type');
      const enumTypeElement = this.dataTypeTemplates?.querySelector(
        `:scope > EnumType[id="${enumType}"]`,
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
        class=${classMap({ dirty: this.dirtyInputs.has(elementID) })}
        ?readOnly="${readOnly}"
        @click=${(e: Event) => e.stopPropagation()}
        @input=${(e: Event) => this.handleValueInput(e, value)}
        @change=${(e: Event) => this.handleValueInput(e, value)}
      ></mbg-val-input>`;
    }

    return html`<mbg-val-input
      id="${elementID}"
      bType="${bType ?? ''}"
      default="${value.textContent as string}"
      label="${label}"
      class=${classMap({ dirty: this.dirtyInputs.has(elementID) })}
      ?readOnly="${readOnly}"
      @click=${(e: Event) => e.stopPropagation()}
      @input=${(e: Event) => this.handleValueInput(e, value)}
      @change=${(e: Event) => this.handleValueInput(e, value)}
    ></mbg-val-input>`;
  }

  private renderValues(
    values: Element[],
    ln: Element,
    numOfSGs: number,
    actSG: number,
    path: { name: string; tag: string }[],
  ) {
    const parentDA = getMostNestedElement(
      this.dataTypeTemplates,
      ln.getAttribute('lnType') as string,
      path,
    );
    const parentFC = parentDA?.getAttribute('fc') as string;
    const readOnly =
      isReadOnly(parentDA) || isReadOnly(values[0].parentElement);

    if (numOfSGs === 0 || !['SG', 'SE'].includes(parentFC)) {
      const inputID = getInputPath(ln, path, '');
      const dirty = this.dirtyInputs.has(inputID);

      return html` <div class="render-values">
        <div class="render-value-container">
          ${this.renderValueInputField(values[0], ln, path, readOnly)}
          ${readOnly
            ? renderReadOnlyIndicator()
            : html` <div class="render-value-actions">
                <md-icon-button
                  class=${classMap({ dirty })}
                  aria-label=${dirty
                    ? 'Save value (unsaved changes)'
                    : 'Save value'}
                  ?disabled=${!dirty}
                  @click=${() => this.updateValue(values[0], ln, path)}
                  ><md-icon>save</md-icon></md-icon-button
                >
                <md-icon-button
                  aria-label="Delete value"
                  @click=${() => {
                    this.dispatchEvent(
                      newEditEventV2(buildRemoveValueEdits(values[0])),
                    );
                    this.clearDirty(inputID);
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

      const dirty = this.dirtyInputs.has(getInputPath(ln, path, i.toString()));

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
                  ? renderReadOnlyIndicator()
                  : html`<div class="render-value-actions">
                      <md-icon-button
                        class=${classMap({ dirty })}
                        aria-label=${dirty
                          ? `Save setting group ${i} (unsaved changes)`
                          : `Save setting group ${i}`}
                        ?disabled=${!dirty}
                        @click=${() => {
                          this.dispatchEvent(
                            newEditEventV2(
                              buildMissingValuesEdits(
                                ln,
                                path,
                                activeValue,
                                numOfSGs,
                              ),
                            ),
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
                            aria-label="Delete all setting group values"
                            @click=${() => {
                              this.dispatchEvent(
                                newEditEventV2(
                                  buildRemoveAllValuesEdits(values),
                                ),
                              );
                              this.clearDirty(
                                ...Array.from({ length: numOfSGs }, (_, sg) =>
                                  getInputPath(ln, path, (sg + 1).toString()),
                                ),
                              );
                              this.requestUpdate();
                            }}
                            ><md-icon>delete_sweep</md-icon></md-icon-button
                          > `
                        : html`<md-icon-button
                            aria-label=${`Sync value of setting group ${i} with active setting group ${actSG}`}
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
                    aria-label=${`Add value for setting group ${i}`}
                    @click=${() => {
                      this.addValue(
                        ln,
                        path,
                        (getTemplateValue(
                          this.dataTypeTemplates,
                          ln.getAttribute('lnType') as string,
                          path,
                        ) as string) || (activeValue?.textContent as string),
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
  ): unknown {
    const basePath = [lnPath(ln), ...path.map(p => p.name)].join(' ');
    const keyPathOf = (key: Element) =>
      `${basePath} ${key.getAttribute('name')}`;

    const entries = Array.from(dataModel.entries()).filter(
      ([key]: [Element, DataModel]) => {
        if (!this.searchTerm && !this.scopeActive) {
          return true;
        }

        const keyPath = keyPathOf(key);

        // exact match or starts with the keyPath followed by a space (to avoid partial matches)
        return !!this.pathsToRender.find(
          renderPath =>
            renderPath === keyPath || renderPath.startsWith(`${keyPath} `),
        );
      },
    );

    return repeat(
      entries,
      ([key]) => key,
      ([key, value]: [Element, DataModel]) => {
        const keyPath = keyPathOf(key);
        const isOpen = this.openPaths.has(keyPath);

        return html` <details
          class="${classMap({
            odd,
            'value-details':
              Array.isArray(values?.get(key)) || value.size === 0,
          })}"
          ?open=${isOpen}
          @toggle=${(e: Event) => this.handleToggle(e, keyPath)}
        >
          <summary
            class="${classMap({
              instantiated: !!values?.has(key),
              uninitialized: value.size === 0 && !hasValues(values?.get(key)),
              'hide-marker':
                Array.isArray(values?.get(key)) || value.size === 0,
              'has-values': Array.isArray(values?.get(key)),
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
                    aria-label=${`Add ${key.getAttribute('name')} to the IED`}
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
                  aria-label=${`Edit ${key.getAttribute('name')}`}
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
                      <md-icon-button
                        aria-label="Expand all"
                        @click=${(e: Event) =>
                          this.handleExpandAll(
                            e,
                            collectExpandablePaths(value, keyPath),
                            keyPath,
                          )}
                        ><md-icon>expand_all</md-icon></md-icon-button
                      >
                    `
                  : nothing}
              </div>
            </div>
          </summary>

          ${this.renderDescription(
            key,
            ln,
            path.concat({
              name: key.getAttribute('name') ?? '',
              tag: setTag(key),
            }),
          )}

          <div>
            ${isOpen
              ? this.renderDataModel(
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
                )
              : nothing}
          </div>
        </details>`;
      },
    );
  }

  private renderLN(ln: Element, numOfSGs: number, actSG: number) {
    const dataModel = this.getLNModel(ln);
    if (!dataModel) return nothing;

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
    const lns = Array.from(ld.querySelectorAll(':scope > LN0, :scope > LN'));

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
              <md-icon-button
                aria-label=${`Edit ${ld.getAttribute('inst')}`}
                @click=${() => this.openEditDialog(ld)}
                ><md-icon>edit</md-icon></md-icon-button
              >
              <md-icon-button
                aria-label="Expand all"
                @click=${(e: Event) =>
                  this.handleExpandAll(e, this.lnExpandPaths(lns, 1))}
                ><md-icon>expand_all</md-icon></md-icon-button
              >
            </div>
          </div>
        </summary>
        ${this.renderDescription(ld)}
        ${repeat(
          lns.filter(ln => {
            if (!this.searchTerm && !this.scopeActive) return true;

            const path = lnPath(ln);
            return this.pathsToRender.some(
              renderPath =>
                renderPath === path || renderPath.startsWith(`${path} `),
            );
          }),
          ln => ln,
          ln => {
            const path = lnPath(ln);
            const isOpen = this.openPaths.has(path);
            return html`
              <details
                class="odd"
                ?open=${isOpen}
                @toggle=${(e: Event) => this.handleToggle(e, path)}
              >
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
                            <md-icon-button
                              aria-label="Delete logical node"
                              @click=${() => this.deleteLN(ln)}
                              ><md-icon>delete</md-icon></md-icon-button
                            >
                          `
                        : nothing}
                      <md-icon-button
                        aria-label="Edit logical node"
                        @click=${() => this.openEditDialog(ln)}
                        ><md-icon>edit</md-icon></md-icon-button
                      >
                      <md-icon-button
                        aria-label="Expand all"
                        @click=${(e: Event) =>
                          this.handleExpandAll(
                            e,
                            this.lnExpandPaths([ln]).slice(1),
                            path,
                          )}
                        ><md-icon>expand_all</md-icon></md-icon-button
                      >
                    </div>
                  </div>
                </summary>
                ${this.renderDescription(ln)}
                ${isOpen ? this.renderLN(ln, numOfSGs, actSG) : nothing}
              </details>
            `;
          },
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

      ${keyed(
        this.ied,
        html`<main>
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
                        aria-label="Edit access point"
                        @click=${() =>
                          this.openEditDialog(server.parentElement!)}
                        ><md-icon>edit</md-icon></md-icon-button
                      >
                      <md-icon-button
                        aria-label="Expand all"
                        @click=${(e: Event) =>
                          this.handleExpandAll(
                            e,
                            this.lnExpandPaths(
                              Array.from(
                                server.querySelectorAll(
                                  ':scope > LDevice > LN0, :scope > LDevice > LN',
                                ),
                              ),
                              1,
                            ),
                          )}
                        ><md-icon>expand_all</md-icon></md-icon-button
                      >
                    </div>
                  </div>
                </summary>
                ${this.renderDescription(server.parentElement!)}
                ${repeat(
                  Array.from(
                    server.querySelectorAll(':scope > LDevice'),
                  ).filter(ld => {
                    if (!this.searchTerm && !this.scopeActive) return true;

                    const lnPaths = Array.from(
                      ld.querySelectorAll(':scope > LN0, :scope > LN'),
                    ).map(lnPath);
                    return this.pathsToRender.some(
                      path =>
                        path === identity(ld) ||
                        lnPaths.some(
                          p => path === p || path.startsWith(`${p} `),
                        ),
                    );
                  }),
                  ld => ld,
                  ld => this.renderLDevice(ld),
                )}
              </details>`,
          )}
        </main>`,
      )}
    `;
  }

  static styles = css`
    main {
      display: flex;
      flex-direction: column;
      gap: var(--mbg-gap-md);
      margin-top: var(--mbg-gap-md);
    }

    main > details {
      width: max-content;
    }

    details:first-of-type {
      border-top-left-radius: var(--mbg-shape);
      border-top-right-radius: var(--mbg-shape);
    }

    details:last-of-type {
      border-bottom-left-radius: var(--mbg-shape);
      border-bottom-right-radius: var(--mbg-shape);
    }

    details {
      padding: 0 var(--mbg-gap-md);
      font-size: var(--mbg-text-lg);
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
      margin-bottom: var(--mbg-gap-md);
    }

    details.ldevice-details[open] {
      padding: var(--mbg-gap-md);
      padding-top: 0;
    }

    details.ldevice-details:last-of-type {
      margin-bottom: 0;
    }

    details:not(.ldevice-details):last-of-type[open] {
      padding-bottom: var(--mbg-gap-md);
    }

    summary {
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--mbg-gap-md);
      list-style: revert;
    }

    summary.has-values {
      align-items: flex-start;
    }

    summary.has-values > .model-details {
      min-height: var(--mbg-height);
    }

    summary.has-values > .model-key-container {
      align-items: flex-start;
      line-height: var(--mbg-height);
    }

    summary.instantiated {
      color: var(--oscd-primary);
    }

    summary.instantiated.hide-marker {
      padding: var(--mbg-gap-sm) 0;
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
      padding-left: 2rem;
      font-weight: normal;
      font-size: var(--mbg-text-md);
    }

    span.subtype {
      font-size: var(--mbg-text-sm);
    }

    summary:hover {
      font-weight: bold;
    }

    details:hover > summary span.type {
      opacity: 0.7;
      transition: opacity var(--mbg-motion-fast) cubic-bezier(0, 0.9, 0.45, 1);
    }

    .model-details {
      display: flex;
      align-items: center;
      gap: var(--mbg-gap-sm);
    }

    .model-actions {
      display: flex;
      align-items: center;
      gap: var(--mbg-gap-sm);
    }

    .model-key-container {
      display: flex;
      align-items: center;
      gap: var(--mbg-gap-sm);
    }

    .render-values .render-value-container:not(:first-of-type) {
      margin-top: var(--mbg-gap-sm);
    }

    .render-value-container {
      display: flex;
      align-items: flex-start;
      gap: var(--mbg-gap-sm);
    }

    .render-value-actions {
      display: flex;
      align-items: center;
      min-height: var(--mbg-height);
    }

    .read-only-indicator {
      color: var(--oscd-base0);
    }

    .render-value-actions md-icon-button.dirty {
      position: relative;
      --md-icon-button-icon-color: var(--oscd-secondary);
      --md-icon-button-hover-icon-color: var(--oscd-secondary);
    }

    .render-value-actions md-icon-button.dirty::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--oscd-secondary);
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

    mbg-val-input {
      --mbg-val-input-shape: var(--mbg-shape);
      --mbg-val-input-space: var(--mbg-space);
      --mbg-val-input-height: var(--mbg-height);
    }

    mbg-val-input.dirty {
      --md-outlined-text-field-outline-color: var(--oscd-secondary);
      --md-outlined-text-field-outline-width: 3px;

      --md-outlined-select-text-field-outline-color: var(--oscd-secondary);
      --md-outlined-select-text-field-outline-width: 3px;
    }

    .desc {
      padding: var(--mbg-space) 0;
      margin: auto;
      font-size: var(--mbg-text-md);
      font-style: italic;
    }
  `;
}
