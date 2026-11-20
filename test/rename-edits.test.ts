import { expect } from '@open-wc/testing';
import type { EditV2 } from '@omicronenergy/oscd-api';

import {
  buildAPRenameEdits,
  buildLDeviceRenameEdits,
  buildLNRenameEdits,
} from '../src/utils/rename-edits.js';

import { getSGCB } from '../src/utils/ied-scl.js';
import { findLNReferences } from '../src/utils/ln-model.js';

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

describe('buildLDeviceRenameEdits: bare "inst/..." references', () => {
  let doc: Document;
  const val = (scope: string, doi: string) =>
    doc.querySelector(`${scope} DOI[name="${doi}"] Val`)!.textContent;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(multipleIedsScd, 'application/xml');
    const ld = doc.querySelector('IED[name="IED1"] LDevice[inst="LD1"]')!;
    apply([
      { element: ld, attributes: { inst: 'LDX' } },
      ...buildLDeviceRenameEdits(ld, 'LDX'),
    ]);
  });

  it('rewrites all three reference forms inside the IED', () => {
    expect(val('IED[name="IED1"]', 'BareRef')).to.equal('LDX/LTPP1');
    expect(val('IED[name="IED1"]', 'AtRef')).to.equal('@LDX/LTPP1.Beh');
    expect(val('IED[name="IED1"]', 'FullRef')).to.equal(
      'IED1LDX/LTPP1.Beh.stVal',
    );
  });

  it('rewrites full references from other IEDs but not bare ones', () => {
    expect(val('IED[name="IED2"]', 'RemoteRef')).to.equal('IED1LDX/LTPP1');
    expect(val('IED[name="IED2"]', 'ForeignBareRef')).to.equal('LD1/LTPP1');
  });
});

describe('buildLNRenameEdits', () => {
  let doc: Document;
  const ied1 = 'IED[name="IED1"]';
  const ied2 = 'IED[name="IED2"]';
  const val = (scope: string, doi: string) =>
    doc.querySelector(`${scope} DOI[name="${doi}"] Val`)!.textContent;
  const fcda = (lnInst: string) =>
    doc.querySelector(`FCDA[lnClass="LTPP"][lnInst="${lnInst}"]`)!;
  const ln = (selector: string) =>
    doc.querySelector(`${ied1} LDevice[inst="LD1"] > ${selector}`)!;

  /** Mirrors IedEditor.handleEditSave for an LN. */
  function rename(target: Element, prefix: string, lnInst: string) {
    apply([
      { element: target, attributes: { prefix: prefix || null, inst: lnInst } },
      ...buildLNRenameEdits(target, {
        ldInst: 'LD1',
        lnClass: target.getAttribute('lnClass') ?? '',
        prefix,
        lnInst,
      }),
    ]);
  }

  beforeEach(() => {
    doc = new DOMParser().parseFromString(multipleIedsScd, 'application/xml');
  });

  it('returns no edits when prefix and inst are unchanged', () => {
    const target = ln('LN[lnClass="LTPP"][inst="1"]');
    expect(
      buildLNRenameEdits(target, {
        ldInst: 'LD1',
        lnClass: 'LTPP',
        prefix: '',
        lnInst: '1',
      }),
    ).to.deep.equal([]);
  });

  describe('adding a prefix (LTPP1 -> GM_LTPP1)', () => {
    beforeEach(() => rename(ln('LN[lnClass="LTPP"][inst="1"]'), 'GM_', '1'));

    it('updates the FCDA and leaves LTPP12 alone', () => {
      expect(fcda('1').getAttribute('prefix')).to.equal('GM_');
      expect(fcda('12').getAttribute('prefix')).to.equal('');
    });

    it('updates ExtRefs in other IEDs that point at the LN', () => {
      const extRef = doc.querySelector(`${ied2} ExtRef[lnClass="LTPP"]`)!;
      expect(extRef.getAttribute('prefix')).to.equal('GM_');
      expect(extRef.getAttribute('lnInst')).to.equal('1');
    });

    it('rewrites bare, "@" and full object references in the IED', () => {
      expect(val(ied1, 'BareRef')).to.equal('LD1/GM_LTPP1');
      expect(val(ied1, 'AtRef')).to.equal('@LD1/GM_LTPP1.Beh');
      expect(val(ied1, 'FullRef')).to.equal('IED1LD1/GM_LTPP1.Beh.stVal');
    });

    it('does not touch a longer inst that shares the LN name', () => {
      expect(val(ied1, 'LongerInstRef')).to.equal('LD1/LTPP12');
    });

    it('rewrites full references from other IEDs but not bare ones', () => {
      expect(val(ied2, 'RemoteRef')).to.equal('IED1LD1/GM_LTPP1');
      expect(val(ied2, 'ForeignBareRef')).to.equal('LD1/LTPP1');
    });
  });

  it('updates lnInst references when only the inst changes', () => {
    rename(ln('LN[lnClass="LTPP"][inst="1"]'), '', '3');

    expect(
      doc.querySelectorAll('FCDA[lnClass="LTPP"][lnInst="3"]'),
    ).to.have.length(1);
    expect(val(ied1, 'BareRef')).to.equal('LD1/LTPP3');
    expect(val(ied1, 'LongerInstRef')).to.equal('LD1/LTPP12');
  });

  it('removes the prefix attribute from references when cleared', () => {
    rename(ln('LN[lnClass="LTPP"][inst="1"]'), 'GM_', '1');
    rename(ln('LN[lnClass="LTPP"][prefix="GM_"]'), '', '1');

    expect(fcda('1').hasAttribute('prefix')).to.be.false;
    expect(val(ied1, 'BareRef')).to.equal('LD1/LTPP1');
  });
});

describe('findLNReferences', () => {
  let doc: Document;
  const ltpp1 = () =>
    doc.querySelector(
      'IED[name="IED1"] LDevice[inst="LD1"] > LN[lnClass="LTPP"][inst="1"]',
    )!;
  const valsIn = (ln: Element) => findLNReferences(ln).labels;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(multipleIedsScd, 'application/xml');
  });

  it('finds every reference form across the IED and other IEDs', () => {
    expect(valsIn(ltpp1())).to.have.members([
      'IED1 LD1/LPCP1.BareRef.setSrcRef',
      'IED1 LD1/LPCP1.AtRef.setSrcRef',
      'IED1 LD1/LPCP1.FullRef.setSrcRef',
      'IED2 Sub/LLN0.RemoteRef.setSrcRef',
      "FCDA Beh in DataSet 'ptp'",
    ]);
  });

  it('skips a longer inst and bare references in other IEDs', () => {
    const labels = valsIn(ltpp1()).join('\n');
    expect(labels).not.to.include('LongerInstRef');
    expect(labels).not.to.include('ForeignBareRef');
  });

  it('returns only the FCDAs of this LN', () => {
    const { fcdas } = findLNReferences(ltpp1());
    expect(fcdas).to.have.length(1);
    expect(fcdas[0].getAttribute('lnInst')).to.equal('1');
  });

  it('lists a DAI once even when it has several sGroup Vals', () => {
    const dai = doc.querySelector('DOI[name="BareRef"] > DAI')!;
    const second = dai.querySelector('Val')!.cloneNode(true) as Element;
    second.setAttribute('sGroup', '2');
    dai.appendChild(second);

    expect(valsIn(ltpp1()).filter(l => l.includes('BareRef'))).to.have.length(
      1,
    );
  });

  it('only matches the ldName form when the LDevice has an ldName', () => {
    doc
      .querySelector('IED[name="IED1"] LDevice[inst="LD1"]')!
      .setAttribute('ldName', 'MyLD');
    doc.querySelector('DOI[name="FullRef"] Val')!.textContent = 'MyLD/LTPP1';

    expect(valsIn(ltpp1())).to.have.members([
      'IED1 LD1/LPCP1.FullRef.setSrcRef',
      "FCDA Beh in DataSet 'ptp'",
    ]);
  });

  it('reports exactly the DAIs that a rename rewrites', () => {
    const ln = ltpp1();
    const reported = valsIn(ln).filter(l => !l.startsWith('FCDA'));

    const before = new Map(
      Array.from(doc.querySelectorAll('DAI > Val')).map(v => [
        v,
        v.textContent,
      ]),
    );
    apply(
      buildLNRenameEdits(ln, {
        ldInst: 'LD1',
        lnClass: 'LTPP',
        prefix: 'GM_',
        lnInst: '1',
      }),
    );
    const rewritten = Array.from(before)
      .filter(([v, text]) => v.textContent !== text)
      .map(([v]) => {
        const doi = v.closest('DOI')!.getAttribute('name');
        const ied = v.closest('IED')!.getAttribute('name');
        return `${ied} ${doi}`;
      });

    expect(rewritten).to.have.members(
      reported.map(l => `${l.split(' ')[0]} ${l.split('.')[1]}`),
    );
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
