import { identity, isPublic } from '@openenergytools/scl-lib';

import {
  DataModel,
  getDataModel,
  getTypeIndex,
  getDAILabel,
} from './ied-data-model.js';

export const escapeRegExp = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const lnRefPattern = (ldRef: string, lnName: string) =>
  new RegExp(`^${escapeRegExp(`${ldRef}/${lnName}`)}(?=\\.|$)`);

export interface LNReferences {
  fcdas: Element[];
  labels: string[];
}

export type LNAttributes = {
  ldInst: string;
  lnClass: string;
  lnInst: string;
  prefix: string;
};

export function scopeLNReferences(
  ln: Element,
): { ldRef: string; vals: Element[] }[] {
  const ld = ln.closest('LDevice')!;
  const ldInst = ld.getAttribute('inst') ?? '';

  const ied = ln.closest('IED')!;
  const iedName = ied.getAttribute('name') ?? '';

  const allVals = Array.from(
    ied.ownerDocument.querySelectorAll(':root > IED DAI > Val'),
  ).filter(isPublic);
  const localVals = Array.from(ied.querySelectorAll('DAI > Val')).filter(
    isPublic,
  );

  return ld.hasAttribute('ldName')
    ? [{ ldRef: ld.getAttribute('ldName')!, vals: allVals }]
    : [
        { ldRef: `${iedName}${ldInst}`, vals: allVals },
        { ldRef: `@${ldInst}`, vals: localVals },
        { ldRef: ldInst, vals: localVals },
      ];
}

export function findLNReferences(ln: Element): LNReferences {
  const lnAttrs: LNAttributes = {
    ldInst: (ln.parentNode as Element).getAttribute('inst') ?? '',
    lnClass: ln.getAttribute('lnClass') ?? '',
    lnInst: ln.getAttribute('inst') ?? '',
    prefix: ln.getAttribute('prefix') ?? '',
  };

  const lnName = `${lnAttrs.prefix}${lnAttrs.lnClass}${lnAttrs.lnInst}`;
  const labels: string[] = [];
  const seen = new Set<Element>();

  scopeLNReferences(ln).forEach(({ ldRef, vals }) => {
    const pattern = lnRefPattern(ldRef, lnName);
    vals.forEach(val => {
      const dai = val.parentElement;
      if (!dai || seen.has(dai)) return;

      if (!pattern.test(val.textContent?.trim() ?? '')) return;

      seen.add(dai);
      labels.push(getDAILabel(dai));
    });
  });

  const fcdas: Element[] = [];
  ln.closest('IED')
    ?.querySelectorAll('FCDA')
    .forEach(fcda => {
      if (
        fcda.getAttribute('ldInst') === lnAttrs.ldInst &&
        fcda.getAttribute('lnClass') === lnAttrs.lnClass &&
        (fcda.getAttribute('lnInst') ?? '') === lnAttrs.lnInst &&
        (fcda.getAttribute('prefix') ?? '') === lnAttrs.prefix
      ) {
        fcdas.push(fcda);
        const datasetName = fcda.parentElement?.getAttribute('name') ?? '';
        const doName = fcda.getAttribute('doName') ?? '';
        const daName = fcda.getAttribute('daName');
        const doRef = daName ? `${doName}.${daName}` : doName;
        labels.push(`FCDA ${doRef} in DataSet '${datasetName}'`);
      }
    });

  return { fcdas, labels };
}

export function lnPath(ln: Element): string {
  return `${ln.tagName} ${identity(ln)}`;
}

export function collectExpandablePaths(
  dataModel: DataModel,
  basePath: string,
  maxDepth = Infinity,
  paths: string[] = [],
): string[] {
  if (maxDepth <= 0) return paths;

  dataModel.forEach((value, key) => {
    if (value.size === 0) return;

    const path = `${basePath} ${key.getAttribute('name')}`;
    paths.push(path);
    collectExpandablePaths(value, path, maxDepth - 1, paths);
  });

  return paths;
}

export class LNModelCache {
  private types: Map<string, Element>;

  private models = new Map<Element, DataModel>();

  constructor(dataTypeTemplates: Element | null | undefined) {
    this.types = getTypeIndex(dataTypeTemplates);
  }

  get(ln: Element): DataModel | undefined {
    const lnType = this.types.get(ln.getAttribute('lnType') ?? '');
    if (lnType?.tagName !== 'LNodeType') return undefined;

    let dataModel = this.models.get(lnType);
    if (!dataModel) {
      dataModel = getDataModel(lnType, [lnPath(ln)], this.types);
      this.models.set(lnType, dataModel);
    }

    return dataModel;
  }

  expandPaths(lns: Element[], maxDepth = Infinity): string[] {
    return lns.flatMap(ln => {
      const dataModel = this.get(ln);
      return [
        lnPath(ln),
        ...(dataModel
          ? collectExpandablePaths(dataModel, lnPath(ln), maxDepth)
          : []),
      ];
    });
  }
}
