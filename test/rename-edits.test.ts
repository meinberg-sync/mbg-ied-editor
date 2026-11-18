import { expect } from '@open-wc/testing';
import type { EditV2 } from '@omicronenergy/oscd-api';

import {
  buildAPRenameEdits,
  buildLDeviceRenameEdits,
} from '../src/utils/rename-edits.js';

import { getSGCB } from '../src/utils/ied-scl.js';

import { multipleIedsScd } from './fixtures/multiple-ieds.scd.js';

function apply(edits: EditV2[]) {
  for (const edit of edits) {
    if ('attributes' in edit) {
      for (const [name, value] of Object.entries(edit.attributes ?? {})) {
        if (value === null) edit.element.removeAttribute(name);
        else edit.element.setAttribute(name, value as string);
      }
    } else if ('textContent' in edit) {
      edit.element.textContent = edit.textContent;
    } else {
      throw new Error(`Unexpected edit: ${JSON.stringify(edit)}`);
    }
  }
}

describe('buildLDeviceRenameEdits', () => {
  let doc: Document;
  const q = (s: string) => doc.querySelector(s)!;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(multipleIedsScd, 'application/xml');
    const ld = q('IED[name="IED1"] LDevice[inst="Application"]');
    apply([
      { element: ld, attributes: { inst: 'App' } },
      ...buildLDeviceRenameEdits(ld, 'App'),
    ]);
  });

  it('rewrites the local "@inst" GrRef so the SGCB still resolves', () => {
    expect(
      q('LDevice[inst="Base"] DOI[name="GrRef"] Val').textContent,
    ).to.equal('@App');
    const sgcb = getSGCB(q('IED[name="IED1"] LDevice[inst="Base"]'));
    expect(sgcb?.getAttribute('numOfSGs')).to.equal('3');
  });

  it('rewrites full iedName+inst object references', () => {
    expect(q('LN[lnClass="LGOS"] Val').textContent).to.equal(
      'IED1App/LLN0.gcb',
    );
  });

  it('does not touch a longer inst that shares the prefix', () => {
    expect(q('LN[lnClass="GGIO"] Val').textContent).to.equal('@ApplicationX');
  });

  it('does not touch "@inst" references in another IED', () => {
    expect(q('IED[name="IED2"] DOI[name="InRef"] Val').textContent).to.equal(
      '@Application',
    );
  });

  it('updates ldInst/srcLDInst attributes pointing at this IED only', () => {
    const [own, foreign] = Array.from(doc.querySelectorAll('ExtRef'));
    expect(own.getAttribute('ldInst')).to.equal('App');
    expect(own.getAttribute('srcLDInst')).to.equal('App');
    expect(foreign.getAttribute('ldInst')).to.equal('Application');
    expect(q('FCDA').getAttribute('ldInst')).to.equal('App');
    expect(q('GSE').getAttribute('ldInst')).to.equal('App');
  });
});

describe('buildAPRenameEdits', () => {
  it('updates ConnectedAP and ServerAt of the same IED only', () => {
    const doc = new DOMParser().parseFromString(
      multipleIedsScd,
      'application/xml',
    );
    const ap = doc.querySelector('IED[name="IED1"] > AccessPoint[name="AP1"]')!;
    apply(buildAPRenameEdits(ap, 'S1'));

    expect(doc.querySelector('ConnectedAP')!.getAttribute('apName')).to.equal(
      'S1',
    );
    expect(doc.querySelector('ServerAt')!.getAttribute('apName')).to.equal(
      'S1',
    );
    expect(
      doc.querySelector('IED[name="IED2"] > AccessPoint')!.getAttribute('name'),
    ).to.equal('AP1');
  });
});

describe('getSGCB', () => {
  const ldsWith = (inner: string) =>
    new DOMParser().parseFromString(
      `<SCL><IED name="I"><AccessPoint name="A"><Server>${inner}</Server></AccessPoint></IED></SCL>`,
      'application/xml',
    );
  const grRef = (inst: string, target: string) =>
    `<LDevice inst="${inst}"><LN0><DOI name="GrRef"><DAI name="setSrcRef"><Val>@${target}</Val></DAI></DOI></LN0></LDevice>`;

  it('returns null for a dangling GrRef instead of throwing', () => {
    const doc = ldsWith(grRef('Base', 'Missing'));
    expect(getSGCB(doc.querySelector('LDevice'))).to.equal(null);
  });

  it('returns null for a GrRef cycle instead of recursing forever', () => {
    const doc = ldsWith(grRef('A', 'B') + grRef('B', 'A'));
    expect(getSGCB(doc.querySelector('LDevice'))).to.equal(null);
  });
});
