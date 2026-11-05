import { css, html, ReactiveController, ReactiveControllerHost } from 'lit';

import { EditV2 } from '@omicronenergy/oscd-api';
import { newEditEventV2 } from '@omicronenergy/oscd-api/utils.js';

import { classMap } from 'lit/directives/class-map.js';
import {
  getInputPath,
  getMostNestedElement,
  getTemplateValue,
  isReadOnly,
} from './ied-scl.js';
import { PathSegment } from './ied-data-model.js';

import {
  buildAddValueEdits,
  buildAddValuesEdits,
  buildMissingValuesEdits,
  buildRemoveAllValuesEdits,
  buildUpdateValueEdits,
  findSGValue,
} from './ied-edits.js';

interface SettingGroup {
  ln: Element;
  values: Element[];
  active: Element;
  path: PathSegment[];
  sgNum: number;
  sgAct: number;
  readOnly: boolean;
}

function getInputId(ln: Element, path: PathSegment[], sgIdx?: number) {
  return getInputPath(ln, path, sgIdx ? `${sgIdx}` : '');
}

function renderReadOnlyIndicator() {
  return html`<div
    class="render-value-actions read-only-indicator"
    title="This value is read-only (valKind is RO)"
  >
    <md-icon role="img" aria-label="read-only">lock</md-icon>
  </div>`;
}

export class ValuesController implements ReactiveController {
  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly getTemplates: () => Element,
  ) {
    host.addController(this);
  }

  // Map input ID with the typed value
  private pendingValues = new Map<string, string>();

  // eslint-disable-next-line class-methods-use-this
  hostConnected() {}

  create(ln: Element, da: Element, path: PathSegment[], sgNum: number) {
    this.dispatch(
      buildAddValuesEdits(this.getTemplates(), ln, da, path, sgNum),
    );
  }

  reset() {
    this.pendingValues.clear();
  }

  render(
    ln: Element,
    values: Element[],
    path: PathSegment[],
    sgNum: number,
    sgAct: number,
  ) {
    const parentDA = getMostNestedElement(
      this.getTemplates(),
      ln.getAttribute('lnType') ?? '',
      path,
    );
    const readOnly =
      isReadOnly(parentDA) || isReadOnly(values[0].parentElement);

    if (
      sgNum === 0 ||
      !['SG', 'SE'].includes(parentDA?.getAttribute('fc') ?? '')
    ) {
      return this.renderSingle(ln, values[0], path, readOnly);
    }

    const active =
      values.find(
        val =>
          parseInt(val?.getAttribute('sGroup')?.trim() ?? '0', 10) === sgAct,
      ) ?? values[0];

    return this.renderSG({ ln, values, active, path, sgNum, sgAct, readOnly });
  }

  private renderSG(sg: SettingGroup) {
    const rows = Array.from({ length: sg.sgNum }, (_, i) => {
      const sgIdx = i + 1;
      let value = sg.values.find(
        v => parseInt(v.getAttribute('sGroup')?.trim() ?? '0', 10) === sgIdx,
      );
      if (sg.values.length === 1 && !value?.hasAttribute('sGroup')) {
        [value] = sg.values;
      }

      return value
        ? this.renderSingleSG(sg, value, sgIdx)
        : this.renderMissingSG(sg, sgIdx);
    });

    return html`<div class="render-values">${rows}</div>`;
  }

  private renderSingle(
    ln: Element,
    value: Element,
    path: PathSegment[],
    readOnly: boolean,
  ) {
    const id = getInputId(ln, path);
    const dirty = this.isDirty(id);

    return html` <div class="render-values">
      <div class="render-value-container">
        ${this.renderInput(ln, value, path, readOnly, id, 'Val')}
        ${readOnly
          ? renderReadOnlyIndicator()
          : html` <div class="render-value-actions">
              <md-icon-button
                class=${classMap({ dirty })}
                aria-label=${dirty
                  ? 'Save value (unsaved changes)'
                  : 'Save value'}
                ?disabled=${!dirty}
                @click=${() => this.save(ln, value, path, id)}
                ><md-icon>save</md-icon></md-icon-button
              >
              <md-icon-button
                aria-label="Delete value"
                @click=${() => {
                  this.remove(ln, [value], path);
                }}
                ><md-icon>delete</md-icon></md-icon-button
              >
            </div>`}
      </div>
    </div>`;
  }

  private renderSingleSG(sg: SettingGroup, value: Element, sgIdx: number) {
    const id = getInputId(sg.ln, sg.path, sgIdx);
    const dirty = this.isDirty(id);
    const isActSG = value === sg.active;
    const label = isActSG ? `Val ${sgIdx} (actSG)` : `Val ${sgIdx}`;

    return html`
      <div class="render-value-container">
        ${this.renderInput(sg.ln, value, sg.path, sg.readOnly, id, label)}
        ${sg.readOnly
          ? renderReadOnlyIndicator()
          : html`<div class="render-value-actions">
              <md-icon-button
                class=${classMap({ dirty })}
                aria-label=${dirty
                  ? `Save setting group ${sgIdx} (unsaved changes)`
                  : `Save setting group ${sgIdx}`}
                ?disabled=${!dirty}
                @click=${() => {
                  this.saveSG(sg, value, sgIdx);
                }}
                ><md-icon>save</md-icon></md-icon-button
              >
              ${isActSG
                ? html`<md-icon-button
                    aria-label="Delete all setting group values"
                    @click=${() => {
                      this.remove(sg.ln, sg.values, sg.path, sg.sgNum);
                    }}
                    ><md-icon>delete_sweep</md-icon></md-icon-button
                  > `
                : html`<md-icon-button
                    aria-label=${`Sync value of setting group ${sgIdx} with active setting group ${sg.sgAct}`}
                    @click=${() => {
                      this.sync(sg, value, sgIdx);
                    }}
                    ?disabled=${value.textContent === sg.active?.textContent}
                  >
                    <md-icon>sync</md-icon>
                  </md-icon-button>`}
            </div>`}
      </div>
    `;
  }

  private renderMissingSG(sg: SettingGroup, sgIdx: number) {
    return html`
      <div class="render-value-container">
        <p class="value-error">
          Missing value for SG ${sgIdx}
          <md-icon-button
            aria-label=${`Add value for setting group ${sgIdx}`}
            @click=${() => {
              this.addSG(sg, sgIdx);
            }}
            ><md-icon>add</md-icon></md-icon-button
          >
        </p>
      </div>
    `;
  }

  private renderInput(
    ln: Element,
    value: Element,
    path: PathSegment[],
    readOnly: boolean,
    id: string,
    label: string,
  ) {
    const parentDA = getMostNestedElement(
      this.getTemplates(),
      ln.getAttribute('lnType') as string,
      path,
    );
    const bType = parentDA?.getAttribute('bType');

    const enumVals =
      bType === 'Enum'
        ? Array.from(
            this.getTemplates()?.querySelectorAll(
              `:scope > EnumType[id="${parentDA?.getAttribute('type')}"] > EnumVal`,
            ) ?? [],
          )
        : [];

    return html`<mbg-val-input
      id="${id}"
      bType="${bType ?? ''}"
      .enumOrdinals=${JSON.stringify(enumVals.map(v => v.getAttribute('ord')))}
      .enumLabels=${JSON.stringify(enumVals.map(v => v.textContent))}
      default="${value.textContent as string}"
      label="${label}"
      class=${classMap({ dirty: this.isDirty(id) })}
      ?readOnly="${readOnly}"
      @click=${(e: Event) => e.stopPropagation()}
      @input=${(e: Event) => this.handleInput(e, value)}
      @change=${(e: Event) => this.handleInput(e, value)}
    ></mbg-val-input>`;
  }

  private handleInput(e: Event, target: Element) {
    const { id, value } = e.currentTarget as HTMLElement & {
      value: string;
    };

    if (value !== target.textContent) {
      this.pendingValues.set(id, value);
    } else {
      this.pendingValues.delete(id);
    }

    this.host.requestUpdate();
  }

  private save(ln: Element, value: Element, path: PathSegment[], id: string) {
    const input = this.pendingValues.get(id) ?? value.textContent;
    this.dispatch(buildUpdateValueEdits(ln, path, value, input), id);
  }

  private saveSG(sg: SettingGroup, value: Element, sgIdx: number) {
    this.dispatch(buildMissingValuesEdits(sg.ln, sg.path, sg.active, sg.sgNum));
    const val = findSGValue(value, sgIdx);
    if (val) {
      const id = getInputId(sg.ln, sg.path, sgIdx);
      this.save(sg.ln, val, sg.path, id);
    }
  }

  private sync(sg: SettingGroup, value: Element, sgIdx: number) {
    this.dispatch(
      buildUpdateValueEdits(sg.ln, sg.path, value, sg.active.textContent),
      getInputId(sg.ln, sg.path, sgIdx),
    );
  }

  private addSG(sg: SettingGroup, sgIdx: number) {
    const predefined =
      getTemplateValue(
        this.getTemplates(),
        sg.ln.getAttribute('lnType') ?? '',
        sg.path,
      ) ||
      (sg.active?.textContent ?? '');

    this.dispatch(buildAddValueEdits(sg.ln, sg.path, predefined, `${sgIdx}`));
  }

  private remove(
    ln: Element,
    values: Element[],
    path: PathSegment[],
    sgNum = 0,
  ) {
    const ids = [
      getInputId(ln, path),
      ...Array.from({ length: sgNum }, (_, i) => getInputId(ln, path, i + 1)),
    ];
    this.dispatch(buildRemoveAllValuesEdits(values), ...ids);
  }

  private isDirty(id: string) {
    return this.pendingValues.has(id);
  }

  private clear(...ids: string[]) {
    ids.forEach(id => this.pendingValues.delete(id));
    this.host.requestUpdate();
  }

  private dispatch(edits: EditV2[], ...clearIds: string[]) {
    if (edits.length) {
      this.host.dispatchEvent(newEditEventV2(edits));
    }

    this.clear(...clearIds);
  }
}

export const valuesStyles = css`
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
`;
