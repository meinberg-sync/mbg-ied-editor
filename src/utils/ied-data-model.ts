import { identity } from '@openenergytools/scl-lib';

export const dataModelPathCache = new WeakMap();

export type DataModel = Map<Element, DataModel>;

export type Values = Map<Element, Values | Element[]>;

export function debounce(callback: (...args: unknown[]) => void, delay = 100) {
  let timeout: number;
  return (...args: unknown[]) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), delay);
  };
}

export function hasValues(values: Values | Element[] | undefined): boolean {
  return Array.isArray(values) && values.length > 0;
}

export function getValues(
  instance: Element,
  dataModel: DataModel,
): Values | Element[] {
  // instance -> DOI -> SDI* -> DAI -> Val
  const childVals = Array.from(instance.children).filter(
    child => child.tagName === 'Val',
  );
  if (childVals.length > 0) {
    return childVals;
  }

  const children = Array.from(instance.children).filter(child =>
    ['DOI', 'SDI', 'DAI'].includes(child.tagName),
  );

  const childNames = children.map(child => child.getAttribute('name'));
  const values = new Map<Element, Values | Element[]>();

  dataModel.forEach((value: DataModel, key: Element) => {
    if (childNames.includes(key.getAttribute('name'))) {
      values.set(
        key,
        getValues(
          children.find(
            child => child.getAttribute('name') === key.getAttribute('name'),
          ) as Element,
          value,
        ),
      );
    }
  });

  return values;
}

export function getInitializedEltPath(element: Element): string {
  let path = [`${element.getAttribute('name')}`];

  // traverse through parent elements until an LN is found
  let parentElt = element.parentElement as Element;
  while (parentElt) {
    if (parentElt.tagName === 'LN' || parentElt.tagName === 'LN0') {
      path = [`${parentElt.tagName} ${identity(parentElt)}`].concat(path);
      break;
    }
    path = [`${parentElt.getAttribute('name')}`].concat(path);
    parentElt = parentElt.parentNode as Element;
  }

  return path.join(' ');
}

export function getDataModel(dataType: Element, path: string[]): DataModel {
  // a datatype can have multiple paths - store to avoid duplicates
  const stringPath = path.join(' ');
  if (!dataModelPathCache.has(dataType)) {
    dataModelPathCache.set(dataType, new Set());
  }
  if (!dataModelPathCache.get(dataType).has(stringPath)) {
    dataModelPathCache.get(dataType).add(stringPath);
  }

  const children = Array.from(dataType.children).filter(child =>
    ['DO', 'DA', 'SDO', 'BDA'].includes(child.tagName),
  );
  const dataModel = new Map<Element, DataModel>();

  for (const child of children) {
    if (!dataModelPathCache.has(child)) {
      dataModelPathCache.set(child, new Set());
    }

    const childStringPath = path
      .concat(child.getAttribute('name') as string)
      .join(' ');
    if (!dataModelPathCache.get(child).has(childStringPath)) {
      dataModelPathCache.get(child).add(childStringPath);
    }

    const childType = dataType
      ?.closest('DataTypeTemplates')
      ?.querySelector(`:scope > [id="${child.getAttribute('type')}"]`);
    if (childType) {
      dataModel.set(
        child,
        getDataModel(
          childType,
          path.concat(child.getAttribute('name') as string),
        ),
      );
    } else {
      dataModel.set(child, new Map());
    }
  }

  return dataModel;
}

export function matchesLNToken(ln: Element, token: string): boolean {
  if (token === '*') return true;
  const lower = token.toLowerCase();
  const lnClass = (ln.getAttribute('lnClass') ?? '').toLowerCase();
  const inst = (ln.getAttribute('inst') ?? '').toLowerCase();
  return (
    lnClass.includes(lower) ||
    inst.includes(lower) ||
    `${lnClass}${inst}`.includes(lower)
  );
}

export function matchesNameToken(element: Element, token: string): boolean {
  if (token === '*') return true;
  return (element.getAttribute('name') ?? '')
    .toLowerCase()
    .includes(token.toLowerCase());
}

export function pathHasPrefixAndTokens(
  path: string,
  lnPath: string,
  nameTokens: string[],
): boolean {
  // Check whether a cached path string matches a known LN path prefix
  if (!path.startsWith(lnPath)) return false;

  // If there are no name tokens, any path with the correct LN prefix matches
  if (nameTokens.length === 0) return path.length > lnPath.length;

  // Split the remainder of the path into tokens and check for matches in order
  const remainder = path.slice(lnPath.length + 1);
  const nameParts = remainder.split(' ');
  return nameTokens.every((token, i) => {
    const part = nameParts[i];
    if (!part) return false;
    return token === '*' || part.toLowerCase().includes(token.toLowerCase());
  });
}
