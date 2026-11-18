export const multipleIedsScd = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL">
  <Communication>
    <SubNetwork name="Bus">
      <ConnectedAP iedName="IED1" apName="AP1">
        <GSE ldInst="Application" cbName="gcb"/>
      </ConnectedAP>
    </SubNetwork>
  </Communication>
  <IED name="IED1">
    <AccessPoint name="AP1">
      <Server>
        <LDevice inst="Application">
          <LN0 lnClass="LLN0" inst="">
            <DataSet name="ds">
              <FCDA ldInst="Application" lnClass="LLN0" doName="Beh" fc="ST"/>
            </DataSet>
            <SettingControl numOfSGs="3" actSG="2"/>
          </LN0>
        </LDevice>
        <LDevice inst="Base">
          <LN0 lnClass="LLN0" inst="">
            <DOI name="GrRef"><DAI name="setSrcRef"><Val>@Application</Val></DAI></DOI>
          </LN0>
          <LN lnClass="LGOS" inst="1">
            <DOI name="GoCBRef"><DAI name="setSrcRef"><Val>IED1Application/LLN0.gcb</Val></DAI></DOI>
          </LN>
          <LN lnClass="GGIO" inst="1">
            <DOI name="Other"><DAI name="setSrcRef"><Val>@ApplicationX</Val></DAI></DOI>
          </LN>
        </LDevice>
      </Server>
    </AccessPoint>
    <AccessPoint name="AP2"><ServerAt apName="AP1"/></AccessPoint>
  </IED>
  <IED name="IED2">
    <AccessPoint name="AP1">
      <Server>
        <LDevice inst="Sub">
          <LN0 lnClass="LLN0" inst="">
            <Inputs>
              <ExtRef iedName="IED1" ldInst="Application" srcLDInst="Application" srcCBName="gcb"/>
              <ExtRef iedName="IED2" ldInst="Application"/>
            </Inputs>
            <DOI name="InRef"><DAI name="setSrcRef"><Val>@Application</Val></DAI></DOI>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>
</SCL>`;
