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
