import { EditV2, SetAttributes, SetTextContent } from '@omicronenergy/oscd-api';

const isPublic = (el: Element) => !el.closest('Private');

function setAttr(
  elements: Iterable<Element>,
  attr: string,
  value: string,
): SetAttributes[] {
  return Array.from(elements)
    .filter(isPublic)
    .map(element => ({ element, attributes: { [attr]: value } }));
}

function iedNameRefs(doc: Document, iedName: string, selector: string) {
  return Array.from(doc.querySelectorAll(selector)).filter(
    elt => elt.textContent?.trim() === iedName,
  );
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
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullRef = new RegExp(`^${escape(iedName + oldInst)}(?=/|$)`);
    const localRef = new RegExp(`^@${escape(oldInst)}(?=/|$)`);

    const rewrite = (
      vals: Iterable<Element>,
      pattern: RegExp,
      replacement: string,
    ) =>
      Array.from(vals)
        .filter(isPublic)
        .filter(v => pattern.test(v.textContent?.trim() ?? ''))
        .map<SetTextContent>(v => ({
          element: v,
          textContent: v.textContent!.trim().replace(pattern, replacement),
        }));

    edits.push(
      ...rewrite(
        doc.querySelectorAll(':root > IED DAI > Val'),
        fullRef,
        iedName + newInst,
      ),
      ...rewrite(ied.querySelectorAll('DAI > Val'), localRef, `@${newInst}`),
    );
  }

  return edits;
}
