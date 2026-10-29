import {
  EditV2,
  Insert,
  Remove,
  SetAttributes,
  SetTextContent,
} from '@omicronenergy/oscd-api';

import { PathSegment } from './ied-data-model.js';
import {
  findInstanceToRemove,
  getTemplateValue,
  resolveInstance,
} from './ied-scl.js';

function createVal(ln: Element, textContent: string, sGroup?: string) {
  const val = ln.ownerDocument.createElementNS(ln.namespaceURI, 'Val');
  if (sGroup) val.setAttribute('sGroup', sGroup);
  val.textContent = textContent;
  return val;
}

function sGroupMatches(val: Element, sGroup: number) {
  return (
    val.getAttribute('sGroup') === sGroup.toString() ||
    (!val.hasAttribute('sGroup') && sGroup === 1)
  );
}

export function instantiatePath(
  path: PathSegment[],
  ln: Element,
): { parent: Element; edits: Insert[] } {
  if (path.length === 0) {
    throw new Error('Empty path');
  }

  const edits: Insert[] = [];
  let instance = ln;
  for (const segment of path) {
    let nextInstance = instance.querySelector(
      `:scope > [name="${segment.name}"]`,
    );

    if (!nextInstance) {
      nextInstance = ln.ownerDocument.createElementNS(
        ln.namespaceURI,
        segment.tag,
      );
      nextInstance.setAttribute('name', segment.name);

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

export function buildUpdateValueEdits(
  ln: Element,
  path: PathSegment[],
  value: Element,
  textContent: string,
): EditV2[] {
  const { edits } = instantiatePath(path, ln);
  const setText: SetTextContent = { element: value, textContent };
  return [...edits, setText];
}

export function buildAddValueEdits(
  ln: Element,
  path: PathSegment[],
  textContent: string,
  sGroup?: string,
): EditV2[] {
  const { parent, edits } = instantiatePath(path, ln);
  const insert: Insert = {
    parent,
    node: createVal(ln, textContent, sGroup),
    reference: null,
  };
  return [...edits, insert];
}

export function buildAddValuesEdits(
  templates: Element,
  ln: Element,
  da: Element,
  path: PathSegment[],
  numOfSGs: number,
): EditV2[] {
  const defaultValue =
    getTemplateValue(templates, ln.getAttribute('lnType') ?? '', path) ?? '';
  const isSettingAttr = ['SG', 'SE'].includes(da.getAttribute('fc') ?? '');

  if (!isSettingAttr) {
    return buildAddValueEdits(ln, path, defaultValue);
  }

  // instantiate the path once, otherwise each Val would insert its own DAI
  const { parent, edits } = instantiatePath(path, ln);
  const inserts: Insert[] = Array.from({ length: numOfSGs }, (_, i) => ({
    parent,
    node: createVal(ln, defaultValue, (i + 1).toString()),
    reference: null,
  }));
  return [...edits, ...inserts];
}

export function buildMissingValuesEdits(
  ln: Element,
  path: PathSegment[],
  actSGValue: Element,
  numOfSGs: number,
): EditV2[] {
  const { parent, edits } = instantiatePath(path, ln);
  const values = Array.from(parent.querySelectorAll(':scope > Val'));

  const missingValueEdits: EditV2[] = [...edits];
  for (let i = 1; i <= numOfSGs; i += 1) {
    const val = values.find(v => sGroupMatches(v, i));
    if (!val) {
      missingValueEdits.push({
        parent,
        node: createVal(ln, actSGValue.textContent ?? '', i.toString()),
        reference: null,
      });
    } else if (val.getAttribute('sGroup') !== i.toString()) {
      missingValueEdits.push({
        element: val,
        attributes: { sGroup: i.toString() },
      });
    }
  }

  return missingValueEdits;
}

export function buildRemoveValueEdits(value: Element): Remove[] {
  return [{ node: findInstanceToRemove(value) }];
}

export function buildRemoveAllValuesEdits(values: Element[]): Remove[] {
  const dai = values[0]?.parentElement;
  return dai ? [{ node: findInstanceToRemove(dai) }] : [];
}

export function buildDeleteLNEdits(ln: Element, fcdas: Element[]): Remove[] {
  return [{ node: ln }, ...fcdas.map(fcda => ({ node: fcda }))];
}

export function buildInstanceDescEdits(
  ln: Element,
  path: PathSegment[],
  desc: string,
): EditV2[] {
  const trimmed = desc.trim();

  if (!trimmed) {
    const instance = resolveInstance(ln, path);
    return instance?.hasAttribute('desc')
      ? [{ element: instance, attributes: { desc: null } }]
      : [];
  }

  const { parent, edits } = instantiatePath(path, ln);
  const setDesc: SetAttributes = {
    element: parent,
    attributes: { desc: trimmed },
  };
  return [...edits, setDesc];
}

export function buildAttributeEdits(
  element: Element,
  values: Record<string, string>,
): SetAttributes {
  const attributes: Record<string, string | null> = {};
  for (const [attr, value] of Object.entries(values)) {
    attributes[attr] = value.trim() || null;
  }
  return { element, attributes };
}
