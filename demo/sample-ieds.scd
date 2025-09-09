<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" release="4">
	<Header id="Designer"/>
  <Communication>
		<SubNetwork name="DEMO" type="8-MMS">
			<ConnectedAP apName="AP1" iedName="Just_an_IED">
				<Address>
					<P type="IP">172.31.0.255</P>
					<P type="OSI-AP-Title">1,3,9999,23</P>
					<P type="IP-SUBNET">255.255.255.0</P>
					<P type="IP-GATEWAY">0.0.0.0</P>
					<P type="OSI-AE-Qualifier">23</P>
					<P type="OSI-PSEL">00000001</P>
					<P type="OSI-SSEL">0001</P>
					<P type="OSI-TSEL">0001</P>
				</Address>
			</ConnectedAP>
			<ConnectedAP apName="AP1" iedName="Kind_of_an_IED">
				<Address>
					<P type="IP">172.31.255.255</P>
					<P type="OSI-AP-Title">1,3,9999,23</P>
					<P type="IP-SUBNET">255.255.255.0</P>
					<P type="IP-GATEWAY">0.0.0.0</P>
					<P type="OSI-AE-Qualifier">23</P>
					<P type="OSI-PSEL">00000001</P>
					<P type="OSI-SSEL">0001</P>
					<P type="OSI-TSEL">0001</P>
				</Address>
			</ConnectedAP>
		</SubNetwork>
	</Communication>
	<IED name="Just_an_IED" manufacturer="Dummy">
    <Services>
      <SettingGroups>
        <SGEdit resvTms="true"/>
      </SettingGroups>
    </Services>
		<AccessPoint name="AP1">
			<Server>
				<Authentication/>
				<LDevice inst="Base" desc="Logical device: parent">
					<LN0 lnClass="LLN0" inst="" lnType="Dummy.LLN0">
            <DOI name="SetMod" desc="Mode">
              <DAI name="setVal">
                <Val sGroup="1">on</Val>
                <Val sGroup="2">on</Val>
              </DAI>
            </DOI>
            <SettingControl numOfSGs="3" actSG="1"/>
					</LN0>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
	<IED name="Kind_of_an_IED" manufacturer="Dummy">
    <Services>
      <SettingGroups>
        <SGEdit resvTms="true"/>
      </SettingGroups>
    </Services>
		<AccessPoint name="AP1">
			<Server>
				<Authentication/>
				<LDevice inst="Application">
					<LN0 lnClass="LLN0" inst="" lnType="Dummy.LLN0">
            <DOI name="SetMod" desc="Mode">
              <DAI name="setVal">
                <Val>on</Val>
              </DAI>
            </DOI>
            <SettingControl numOfSGs="3" actSG="2"/>
					</LN0>
				</LDevice>
				<LDevice inst="Base">
					<LN0 lnClass="LLN0" inst="" lnType="NewDummy.LLN0">
            <DOI name="SetMod" desc="Mode">
              <DAI name="setVal">
                <Val>on</Val>
              </DAI>
            </DOI>
            <DOI name="GrRef" desc="GrRef">
              <DAI name="setSrcRef">
                <Val>@Application</Val>
              </DAI>
            </DOI>
					</LN0>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
	<DataTypeTemplates>
		<LNodeType lnClass="LLN0" id="Dummy.LLN0" desc="Logical device LN: parent">
			<DO name="Mod" type="OpenSCD_ENC_Mod"/>
			<DO name="SetMod" type="OpenSCD_ENG_SetMod"/>
			<DO name="Beh" type="OpenSCD_ENS_Beh"/>
			<DO name="Health" type="OpenSCD_ENS_Health"/>
			<DO name="NamPlt" type="OpenSCD_LPL_LD"/>
			<DO name="LocKey" type="OpenSCD_SPS_simple"/>
			<DO name="Loc" type="OpenSCD_SPS_simple"/>
		</LNodeType>
		<LNodeType lnClass="LLN0" id="NewDummy.LLN0" desc="References another LDevice for the SGCB">
			<DO name="GrRef" type="OpenSCD_ORG_GrRef"/>
			<DO name="Mod" type="OpenSCD_ENC_Mod"/>
			<DO name="SetMod" type="OpenSCD_ENG_SetMod"/>
			<DO name="Beh" type="OpenSCD_ENS_Beh"/>
			<DO name="Health" type="OpenSCD_ENS_Health"/>
			<DO name="NamPlt" type="OpenSCD_LPL_LD"/>
			<DO name="LocKey" type="OpenSCD_SPS_simple"/>
			<DO name="Loc" type="OpenSCD_SPS_simple"/>
		</LNodeType>
    <DOType cdc="ORG" id="OpenSCD_ORG_GrRef">
      <DA name="setSrcRef" bType="ObjRef" valKind="RO" dchg="true" fc="SP"/>
    </DOType>
		<DOType cdc="SPS" id="OpenSCD_SPS_simple">
			<DA name="stVal" bType="BOOLEAN" dchg="true" fc="ST"/>
			<DA name="q" bType="Quality" qchg="true" fc="ST"/>
			<DA name="t" bType="Timestamp" fc="ST"/>
			<DA name="d" bType="VisString255" fc="DC"/>
		</DOType>
		<DOType cdc="LPL" id="OpenSCD_LPL_LD" desc="Logical device nameplate">
			<DA name="vendor" bType="VisString255" fc="DC"/>
			<DA name="swRev" bType="VisString255" fc="DC"/>
			<DA name="d" bType="VisString255" fc="DC"/>
			<DA name="configRev" bType="VisString255" fc="DC"/>
			<DA name="ldNs" bType="VisString255" fc="EX" valKind="RO">
				<Val>IEC 61850-7-4:2007B4</Val>
			</DA>
		</DOType>
		<DOType cdc="ENS" id="OpenSCD_ENS_Health" desc="Health of the logical device (related to HW and SW)">
			<DA name="stVal" bType="Enum" dchg="true" fc="ST" type="HealthKind"/>
			<DA name="q" bType="Quality" qchg="true" fc="ST"/>
			<DA name="t" bType="Timestamp" fc="ST"/>
		</DOType>
		<DOType cdc="ENS" id="OpenSCD_ENS_Beh" desc="Behaviour of the logical device">
			<DA name="stVal" bType="Enum" dchg="true" fc="ST" type="BehaviourModeKind"/>
			<DA name="q" bType="Quality" qchg="true" fc="ST"/>
			<DA name="t" bType="Timestamp" fc="ST"/>
		</DOType>
		<DOType cdc="ENC" id="OpenSCD_ENC_Mod" desc="Operating mode of the logical device">
			<DA name="origin" bType="Struct" dchg="true" fc="ST" type="OpenSCD_Originator"/>
			<DA name="stVal" bType="Enum" dchg="true" fc="ST" type="BehaviourModeKind"/>
			<DA name="q" bType="Quality" qchg="true" fc="ST"/>
			<DA name="t" bType="Timestamp" fc="ST"/>
			<DA name="ctlModel" bType="Enum" fc="CF" type="CtlModelKind">
				<Val>sbo-with-enhanced-security</Val>
			</DA>
			<DA name="sboTimeout" bType="INT32U" fc="CF">
				<Val>30000</Val>
			</DA>
			<DA name="operTimeout" bType="INT32U" fc="CF">
				<Val>600</Val>
			</DA>
			<DA name="SBOw" bType="Struct" fc="CO" type="OpenSCD_OperSBOw_BehaviourModeKind"/>
			<DA name="Oper" bType="Struct" fc="CO" type="OpenSCD_OperSBOw_BehaviourModeKind"/>
			<DA name="Cancel" bType="Struct" fc="CO" type="OpenSCD_Cancel_BehaviourModeKind"/>
		</DOType>
    <DOType id="OpenSCD_ENG_SetMod" cdc="ENG">
      <DA name="setVal" bType="Enum" valKind="Set" type="SetModeKind" fc="SE"/>
      <DA name="dataNs" bType="VisString255" valKind="RO" fc="EX">
        <Val>SIPROTEC5</Val>
      </DA>
    </DOType>
		<DAType id="OpenSCD_Cancel_BehaviourModeKind" desc="Used to terminate a command before it is executed">
			<BDA name="ctlVal" bType="Enum" type="BehaviourModeKind"/>
			<BDA name="origin" bType="Struct" type="OpenSCD_Originator"/>
			<BDA name="ctlNum" bType="INT8U"/>
			<BDA name="T" bType="Timestamp"/>
			<BDA name="Test" bType="BOOLEAN"/>
			<ProtNs type="8-MMS">IEC 61850-8-1:2003</ProtNs>
		</DAType>
		<DAType id="OpenSCD_OperSBOw_BehaviourModeKind" desc="Select before operate with enhanced security">
			<BDA name="ctlVal" bType="Enum" type="BehaviourModeKind"/>
			<BDA name="origin" bType="Struct" type="OpenSCD_Originator"/>
			<BDA name="ctlNum" bType="INT8U"/>
			<BDA name="T" bType="Timestamp"/>
			<BDA name="Test" bType="BOOLEAN"/>
			<BDA name="Check" bType="Check"/>
			<ProtNs type="8-MMS">IEC 61850-8-1:2003</ProtNs>
		</DAType>
		<DAType id="OpenSCD_Originator" desc="The source or entity that initiates a control command">
			<BDA name="orCat" bType="Enum" type="OriginatorCategoryKind"/>
			<BDA name="orIdent" bType="Octet64"/>
		</DAType>
		<EnumType id="HealthKind">
			<EnumVal ord="1">Ok</EnumVal>
			<EnumVal ord="2">Warning</EnumVal>
			<EnumVal ord="3">Alarm</EnumVal>
		</EnumType>
		<EnumType id="CtlModelKind">
			<EnumVal ord="0">status-only</EnumVal>
			<EnumVal ord="1">direct-with-normal-security</EnumVal>
			<EnumVal ord="2">sbo-with-normal-security</EnumVal>
			<EnumVal ord="3">direct-with-enhanced-security</EnumVal>
			<EnumVal ord="4">sbo-with-enhanced-security</EnumVal>
		</EnumType>
		<EnumType id="BehaviourModeKind">
			<EnumVal ord="1">on</EnumVal>
			<EnumVal ord="2">blocked</EnumVal>
			<EnumVal ord="3">test</EnumVal>
			<EnumVal ord="4">test/blocked</EnumVal>
			<EnumVal ord="5">off</EnumVal>
		</EnumType>
		<EnumType id="OriginatorCategoryKind">
			<EnumVal ord="0">not-supported</EnumVal>
			<EnumVal ord="1">bay-control</EnumVal>
			<EnumVal ord="2">station-control</EnumVal>
			<EnumVal ord="3">remote-control</EnumVal>
			<EnumVal ord="4">automatic-bay</EnumVal>
			<EnumVal ord="5">automatic-station</EnumVal>
			<EnumVal ord="6">automatic-remote</EnumVal>
			<EnumVal ord="7">maintenance</EnumVal>
			<EnumVal ord="8">process</EnumVal>
		</EnumType>
    <EnumType id="SetModeKind">
      <EnumVal ord="5">off</EnumVal>
      <EnumVal ord="1">on</EnumVal>
    </EnumType>
	</DataTypeTemplates>
</SCL>
