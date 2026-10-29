import { identity } from '@openenergytools/scl-lib';

import {
  DataModel,
  getDataModel,
  getInitializedEltPath,
  getTypeIndex,
} from './ied-data-model.js';

export interface LNReferences {
  fcdas: Element[];
  labels: string[];
}

export function findLNReferences(ln: Element): LNReferences {
  const ldInst = (ln.parentNode as Element).getAttribute('inst') ?? '';
  const lnClass = ln.getAttribute('lnClass') ?? '';
  const lnInst = ln.getAttribute('inst') ?? '';
  const prefix = ln.getAttribute('prefix') ?? '';
  const lnIdentifier = `${lnClass}${lnInst}`;

  const labels: string[] = [];
  Array.from(ln.parentElement?.querySelectorAll('* DAI') ?? []).forEach(elt => {
    if (elt.querySelector('Val')?.textContent === `${ldInst}/${lnIdentifier}`) {
      const splitPath = getInitializedEltPath(elt).split(' ');
      labels.push(`LN ${splitPath[2]}${splitPath[3]}`);
    }
  });

  const fcdas: Element[] = [];
  ln.closest('IED')
    ?.querySelectorAll('FCDA')
    .forEach(fcda => {
      if (
        fcda.getAttribute('ldInst') === ldInst &&
        fcda.getAttribute('lnClass') === lnClass &&
        (fcda.getAttribute('lnInst') ?? '') === lnInst &&
        (fcda.getAttribute('prefix') ?? '') === prefix
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
