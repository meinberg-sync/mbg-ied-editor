// A tiny SCL file with just enough data to exercise every kind of value row:
// - Mod.sboTimeout   -> a plain (non setting group) value
// - SetMod.setVal    -> a setting group value, with SG 3 missing
// - GrRef.setSrcRef  -> a read-only value (valKind="RO")
export const valuesScd = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" release="4">
  <Header id="ValuesTest"/>
  <IED name="TestIED" manufacturer="Dummy">
    <AccessPoint name="AP1">
      <Server>
        <Authentication/>
        <LDevice inst="LD1">
          <LN0 lnClass="LLN0" inst="" lnType="Test.LLN0">
            <DOI name="Mod">
              <DAI name="sboTimeout">
                <Val>30000</Val>
              </DAI>
            </DOI>
            <DOI name="SetMod">
              <DAI name="setVal">
                <Val sGroup="1">on</Val>
                <Val sGroup="2">off</Val>
              </DAI>
            </DOI>
            <DOI name="GrRef">
              <DAI name="setSrcRef">
                <Val>@LD1</Val>
              </DAI>
            </DOI>
            <SettingControl numOfSGs="3" actSG="1"/>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>
  <DataTypeTemplates>
    <LNodeType lnClass="LLN0" id="Test.LLN0">
      <DO name="Mod" type="Test_Mod"/>
      <DO name="SetMod" type="Test_SetMod"/>
      <DO name="GrRef" type="Test_GrRef"/>
    </LNodeType>
    <DOType cdc="ENC" id="Test_Mod">
      <DA name="sboTimeout" bType="INT32U" fc="CF"/>
    </DOType>
    <DOType cdc="ENG" id="Test_SetMod">
      <DA name="setVal" bType="Enum" valKind="Set" type="SetModeKind" fc="SE"/>
    </DOType>
    <DOType cdc="ORG" id="Test_GrRef">
      <DA name="setSrcRef" bType="ObjRef" valKind="RO" fc="SP"/>
    </DOType>
    <EnumType id="SetModeKind">
      <EnumVal ord="1">on</EnumVal>
      <EnumVal ord="5">off</EnumVal>
    </EnumType>
  </DataTypeTemplates>
</SCL>`;
