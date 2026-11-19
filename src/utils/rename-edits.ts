import { EditV2, SetAttributes, SetTextContent } from '@omicronenergy/oscd-api';

import type { LNAttributes } from './ln-model.js';

const isPublic = (el: Element) => !el.closest('Private');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const attribute = (elt: Element, name: string) => elt.getAttribute(name) ?? '';

const attrKeys: LNAttributes = {
  ldInst: 'ldInst',
  lnClass: 'lnClass',
  lnInst: 'lnInst',
  prefix: 'prefix',
};

function setAttr(
  elements: Iterable<Element>,
  attr: string,
  value: string,
): SetAttributes[] {
  return Array.from(elements)
    .filter(isPublic)
    .map(element => ({ element, attributes: { [attr]: value } }));
}

function refersTo(
  elt: Element,
  id: LNAttributes,
  keys: LNAttributes = attrKeys,
) {
  return (
    attribute(elt, keys.ldInst) === id.ldInst &&
    attribute(elt, keys.lnClass) === id.lnClass &&
    attribute(elt, keys.lnInst) === id.lnInst &&
    attribute(elt, keys.prefix) === id.prefix
  );
}

function iedNameRefs(doc: Document, iedName: string, selector: string) {
  return Array.from(doc.querySelectorAll(selector)).filter(
    elt => elt.textContent?.trim() === iedName,
  );
}

function rewriteVals(
  vals: Iterable<Element>,
  pattern: RegExp,
  replacement: string,
): SetTextContent[] {
  return Array.from(vals)
    .filter(isPublic)
    .filter(v => pattern.test(v.textContent?.trim() ?? ''))
    .map(v => ({
      element: v,
      textContent: v.textContent!.trim().replace(pattern, () => replacement),
    }));
}

function rewriteLNObjectRefs(
  ied: Element,
  iedName: string,
  ld: Element,
  oldAttrs: LNAttributes,
  newAttrs: LNAttributes,
) {
  const oldLN = `${oldAttrs.prefix}${oldAttrs.lnClass}${oldAttrs.lnInst}`;
  const newLN = `${newAttrs.prefix}${newAttrs.lnClass}${newAttrs.lnInst}`;

  const rewriteTargets = (vals: Iterable<Element>, ldRef: string) =>
    rewriteVals(
      vals,
      new RegExp(`^${escapeRegExp(`${ldRef}/${oldLN}`)}(?=\\.|$)`),
      `${ldRef}/${newLN}`,
    );

  const allVals = ied.ownerDocument.querySelectorAll(':root > IED DAI > Val');
  const localVals = ied.querySelectorAll('DAI > Val');

  if (ld.hasAttribute('ldName')) {
    return rewriteTargets(allVals, attribute(ld, 'ldName'));
  }

  return [
    ...rewriteTargets(allVals, `${iedName}${oldAttrs.ldInst}`),
    ...rewriteTargets(localVals, `@${oldAttrs.ldInst}`),
    ...rewriteTargets(localVals, oldAttrs.ldInst),
  ];
}

export function buildAPRenameEdits(ap: Element, newName: string): EditV2[] {
  const oldName = ap.getAttribute('name');
  const ied = ap.closest('IED');
  const iedName = ied?.getAttribute('name');
  if (!oldName || !ied || !iedName || oldName === newName) return [];

  const doc = ap.ownerDocument;
  return [
    ...setAttr(
      doc.querySelectorAll(
        `:root > Communication > SubNetwork > ConnectedAP[iedName="${iedName}"][apName="${oldName}"]`,
      ),
      'apName',
      newName,
    ),
    ...setAttr(
      ied.querySelectorAll(
        `:scope > AccessPoint > ServerAt[apName="${oldName}"]`,
      ),
      'apName',
      newName,
    ),
    ...setAttr(
      doc.querySelectorAll(`KDC[iedName="${iedName}"][apName="${oldName}"]`),
      'apName',
      newName,
    ),
    ...setAttr(
      doc.querySelectorAll(
        `ClientLN[iedName="${iedName}"][apRef="${oldName}"]`,
      ),
      'apRef',
      newName,
    ),
    ...setAttr(
      iedNameRefs(doc, iedName, `IEDName[apRef="${oldName}"]`),
      'apRef',
      newName,
    ),
  ];
}

export function buildLDeviceRenameEdits(
  lDevice: Element,
  newInst: string,
): EditV2[] {
  const oldInst = lDevice.getAttribute('inst');
  const ied = lDevice.closest('IED');
  const iedName = ied?.getAttribute('name');
  if (!oldInst || !ied || !iedName || oldInst === newInst) return [];

  const doc = lDevice.ownerDocument;
  const ref = (tag: string, attr = 'ldInst') =>
    `${tag}[iedName="${iedName}"][${attr}="${oldInst}"]`;

  const edits: EditV2[] = [
    ...setAttr(
      doc.querySelectorAll(
        ['ExtRef', 'ClientLN', 'Association', 'LNode']
          .map(t => ref(t))
          .join(','),
      ),
      'ldInst',
      newInst,
    ),
    ...setAttr(
      doc.querySelectorAll(ref('ExtRef', 'srcLDInst')),
      'srcLDInst',
      newInst,
    ),
    ...setAttr(
      iedNameRefs(doc, iedName, `IEDName[ldInst="${oldInst}"]`),
      'ldInst',
      newInst,
    ),
    ...setAttr(
      doc.querySelectorAll(
        `:root > Communication > SubNetwork > ConnectedAP[iedName="${iedName}"] > GSE[ldInst="${oldInst}"],` +
          `:root > Communication > SubNetwork > ConnectedAP[iedName="${iedName}"] > SMV[ldInst="${oldInst}"]`,
      ),
      'ldInst',
      newInst,
    ),
    ...setAttr(
      ied.querySelectorAll(
        `FCDA[ldInst="${oldInst}"], LogControl[ldInst="${oldInst}"]`,
      ),
      'ldInst',
      newInst,
    ),
  ];

  if (!lDevice.hasAttribute('ldName')) {
    const fullRef = new RegExp(`^${escapeRegExp(iedName + oldInst)}(?=/|$)`);
    const localRefA = new RegExp(`^@${escapeRegExp(oldInst)}(?=/|$)`);
    const localRefB = new RegExp(`^${escapeRegExp(oldInst)}(?=/|$)`);

    const allVals = ied.ownerDocument.querySelectorAll(':root > IED DAI > Val');
    const localVals = ied.querySelectorAll('DAI > Val');

    edits.push(
      ...rewriteVals(allVals, fullRef, iedName + newInst),
      ...rewriteVals(localVals, localRefA, `@${newInst}`),
      ...rewriteVals(localVals, localRefB, newInst),
    );
  }

  return edits;
}

export function buildLNRenameEdits(
  ln: Element,
  reqAttrs: LNAttributes,
): EditV2[] {
  const ld = ln.closest('LDevice');
  const ied = ln.closest('IED');
  const iedName = ied?.getAttribute('name');
  if (!ld || !ied || !iedName) return [];

  const oldAttrs: LNAttributes = {
    ldInst: attribute(ld, 'inst'),
    lnClass: attribute(ln, 'lnClass'),
    lnInst: attribute(ln, 'inst'),
    prefix: attribute(ln, 'prefix'),
  };

  if (
    oldAttrs.prefix === reqAttrs.prefix &&
    oldAttrs.lnInst === reqAttrs.lnInst
  ) {
    return [];
  }

  const doc = ln.ownerDocument;
  const newAttrs = (pKey: string, iKey: string) => ({
    [pKey]: reqAttrs.prefix || null,
    [iKey]: reqAttrs.lnInst,
  });
  const update = (elts: Element[], pKey = 'prefix', iKey = 'lnInst') =>
    elts.filter(isPublic).map<SetAttributes>(element => ({
      element,
      attributes: newAttrs(pKey, iKey),
    }));

  const inDoc = (tag: string) =>
    Array.from(doc.querySelectorAll(`${tag}[iedName="${iedName}"]`));

  return [
    ...update(
      ['ExtRef', 'ClientLN', 'Association', 'LNode']
        .flatMap(inDoc)
        .filter(el => refersTo(el, oldAttrs)),
    ),
    ...update(
      inDoc('ExtRef').filter(el =>
        refersTo(el, oldAttrs, {
          ldInst: 'srcLDInst',
          lnClass: 'srcLNClass',
          lnInst: 'srcLNInst',
          prefix: 'srcPrefix',
        }),
      ),
      'srcPrefix',
      'srcLNInst',
    ),
    ...update(
      iedNameRefs(doc, iedName, 'IEDName').filter(el => refersTo(el, oldAttrs)),
    ),
    ...update(
      Array.from(ied.querySelectorAll('FCDA')).filter(el =>
        refersTo(el, oldAttrs),
      ),
    ),
    ...rewriteLNObjectRefs(ied, iedName, ld, oldAttrs, reqAttrs),
  ];
}
