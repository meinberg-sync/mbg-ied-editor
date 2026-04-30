export function findInstanceToRemove(element: Element) {
  const parent = element.parentElement as Element;
  const siblings = Array.from(parent.children).filter(
    child => child.tagName === element.tagName,
  );

  if (siblings.length > 1 || !['DOI', 'SDI', 'DAI'].includes(parent.tagName)) {
    return element;
  }

  return findInstanceToRemove(parent);
}

export function getInputPath(
  ln: Element,
  path: { name: string; tag: string }[],
  sGroup: string,
) {
  const parentLD = (ln.parentNode as Element)?.getAttribute('inst');
  const lnClass = ln.getAttribute('lnClass');
  const lnInst = ln.getAttribute('inst');

  let elementID = `${parentLD}-${lnClass}${lnInst}`;
  for (let i = 0; i < path.length; i += 1) {
    elementID += `-${path[i].name}`;
    if (i === path.length - 1) elementID += sGroup;
  }

  return elementID;
}

export function getInstanceDescription(
  target: Element,
  host?: Element,
  path: { name: string; tag: string }[] = [],
) {
  let instantiatedDesc = '';

  // if the instance is in a path, check if it has a description in the IED
  if (path.length > 0 && host) {
    let childInstance = host.querySelector(
      `:scope > DOI[name="${path[0].name}"]`,
    );
    for (let i = 1; i < path.length && childInstance; i += 1) {
      childInstance = childInstance.querySelector(
        `:scope > *[name="${path[i].name}"]`,
      );
    }

    if (childInstance?.getAttribute('name') === target.getAttribute('name')) {
      instantiatedDesc = childInstance?.getAttribute('desc') ?? '';
    }
  }

  if (instantiatedDesc) return instantiatedDesc;

  return target.getAttribute('desc') ?? '';
}

export function getMostNestedElement(
  template: Element,
  lnType: string,
  path: { name: string; tag: string }[],
): Element | null {
  let parentName = path[0].name;
  let parentElt = template?.querySelector(
    `:scope > LNodeType[id="${lnType}"] > DO[name="${parentName}"]`,
  );
  let parentType = parentElt?.getAttribute('type') as string;

  let i = 1;
  for (; i < path.length; i += 1) {
    parentName = path[i].name;
    parentElt = template?.querySelector(
      `:scope > *[id="${parentType}"] > *[name="${parentName}"]`,
    );

    if (i === path.length - 1) break;

    parentType = parentElt?.getAttribute('type') as string;
  }

  return parentElt ?? null;
}

export function getSGCB(ld: Element): Element | null {
  if (ld.querySelector(':scope > LN0 > SettingControl')) {
    return ld.querySelector(':scope > LN0 > SettingControl') as Element;
  }

  if (!ld.querySelector(':scope > LN0 > DOI[name="GrRef"]')) {
    return null;
  }

  const setSrcRef = ld.querySelector(
    ':scope > LN0 > DOI[name="GrRef"] > DAI[name="setSrcRef"] > Val',
  );
  const sgcbRef = setSrcRef?.textContent?.trim().replace(/^@/, '') ?? '';
  const ldRef = ld
    .closest('Server')!
    .querySelector(`:scope > LDevice[inst="${sgcbRef}"]`);

  return getSGCB(ldRef as Element);
}

export function getTemplateDescription(template: Element, target: Element) {
  if (!template) return '';

  let instTemplate = null;
  if (target.nodeName === 'LN' || target.nodeName === 'LN0') {
    instTemplate = template?.querySelector(
      `:scope > LNodeType[id="${target.getAttribute('lnType')}"]`,
    );
  } else if (target.nodeName !== 'LDevice') {
    instTemplate = template?.querySelector(
      `:scope > *[id="${target.getAttribute('type')}"]`,
    );
  }

  return instTemplate?.getAttribute('desc') ?? '';
}

export function getTemplateValue(
  template: Element,
  lnType: string,
  path: { name: string; tag: string }[],
) {
  if (!template) return '';

  const lnTemplate = template?.querySelector(
    `:scope > LNodeType[id="${lnType}"]`,
  );
  let nestedInst = lnTemplate?.querySelector(
    `:scope > *[name="${path[0].name}"]`,
  );

  for (let i = 1; i < path.length; i += 1) {
    const instType = nestedInst?.getAttribute('type');
    const instTemplate = template?.querySelector(
      `:scope > *[id="${instType}"]`,
    );
    nestedInst = instTemplate?.querySelector(
      `:scope > *[name="${path[i].name}"]`,
    );
  }

  if (nestedInst?.querySelector('Val')) {
    return nestedInst?.querySelector('Val')?.textContent;
  }

  return '';
}

export function isReadOnly(da: Element | null): boolean {
  if (!da) return false;

  const isKindRO = (da.getAttribute('valKind') as string) === 'RO';
  if (!da.getAttribute('valImport')) return isKindRO;

  const canImport = (da.getAttribute('valImport') as string) === 'false';
  return isKindRO && canImport;
}

export function setTag(key: Element) {
  let tag = 'DAI';

  if (key.tagName === 'DO') {
    tag = 'DOI';
  } else if (key.tagName === 'SDO' || key.getAttribute('bType') === 'Struct') {
    tag = 'SDI';
  }

  return tag;
}
