import { expect } from '@open-wc/testing';
import { findInstanceToRemove } from '../src/utils/ied-scl.js';

describe('findInstanceToRemove', () => {
  it('keeps a DOI that still has a sibling of a different tag', () => {
    const doc = new DOMParser().parseFromString(
      `<LN0>
        <DOI name="Mod">
          <SDI name="origin"><DAI name="orCat"><Val>1</Val></DAI></SDI>
          <DAI name="ctlModel"><Val>direct</Val></DAI>
        </DOI>
      </LN0>`,
      'application/xml',
    );
    const val = doc.querySelector('DAI[name="orCat"] > Val')!;

    expect(findInstanceToRemove(val)).to.equal(
      doc.querySelector('SDI[name="origin"]'),
    );
  });
});
