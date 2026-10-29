import { identity } from '@openenergytools/scl-lib';

import { DataModel, getInitializedEltPath } from './ied-data-model.js';

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
