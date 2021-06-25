/*
================== qMRLab vfa_t1 pulse sequence = 
This script is responsible for collecting raw data 
and reconstructing images. 
 
Waveforms exported by SpinBench and described by application.apd
determine the initial state of the sequence. For this 
application, initial parameters are fetched from: 

- [excitation] SincRF + Z (SlabSelect.spv)
- [echodelay] in us, to be exposed to GUI. (Not linked to a file)
- [readout] 3D Cartesian Readout (CartesianReadout3D.spv)
- [spoiler] Area Trapezoid  (SpoilerGradient.spv)

For now, base resolution components are hardcoded to be 
256X256mm (inplane) and 5mm (slab thickness) for the 
3D readout. 

TODO: These parameters are to be fetched from controller. 

Author:  Agah Karakuzu agahkarakuzu@gmail.com
Created: October, 2019. 
// =================================================
*/

var sequenceId = rth.sequenceId();
var instanceName = rth.instanceName();

var observer = new RthReconRawObserver();
observer.setSequenceId(sequenceId);
observer.objectName = "Observer";
// Acquisition samples vs acqCartROSamples!!!!
observer.observeValueForKey("acquisition.samples", "samples");
// Disable button after observer is discond
observer.scanDisabled.connect(rth.deactivateScanButton);

var viewKsIndexKey = "acquisition.<Cartesian Readout>.index";
var kspace = new RthReconKSpace();
if (!this.kspace.loadFromReadoutTags(rth.readoutTags("readout"),viewKsIndexKey)) {
  RTHLOGGER_ERROR("Could not load k-space trajectory from readout tags");
}

function reconBlock(input,index) {
  
  var that  = this;
  
  this.attenSplit = new RthReconSplitter();
  this.attenSplit.objectName = "Atten Split " + index;
  this.attenSplit.setInput(input);
  
  this.attenOutput = function() {
    return this.attenSplit.output(0);
  };

// acquisition.<Cartesian Readout>.index --> 0 to 123 
// acquisition.<inter>.input --> 0/1 
 this.sort3d = new RthReconSort();
 this.sort3d.objectName = "TRNumber(" + index + ")";
 this.sort3d.setIndexKeys(["acquisition.<Cartesian Readout>.index","acquisition.<zPartition" + index + ">.index"]);
 this.sort3d.setInput(this.attenSplit.output(1));
 //"acquisition.<Cartesian Readout>.index","acquisition.<inter>.input","acquisition.<zPartition1>.index"
 //this.sort3d.observeKeys(["mri.RunNumber"]);
 this.sort3d.observeKeys(["acquisition.<interleave>.input"]);
 this.sort3d.observedKeysChanged.connect(
  function(keys) {
    that.sort3d.resetAccumulation();
    var yEncodes = keys["reconstruction.phaseEncodes"];
    //RTHLOGGER_WARNING("CROUT IDX" + keys["acquisition.<Cartesian Readout>.index"] + "INTERLEAVE" + keys["acquisition.<inter>.input"] + "SLICE" + keys["acquisition.<zPartition1>.index"]);
    var samples = keys["acquisition.samples"];
    //var coils = keys["acquisition.channels"];
    var zEncodes = keys["reconstruction.zPartitions"];
    //this.sort3d.extent = [samples, coils, yEncodes, zEncodes]; // if the input is [samples x coils]
    that.sort3d.extent = [samples,yEncodes,zEncodes]; // if the input is [samples]
    that.sort3d.accumulate = yEncodes * zEncodes;
  }
);

  this.rawSplit = new RthReconRawSplitter();
  this.rawSplit.objectName = "Split for TR " + index;
  this.rawSplit.setInput(this.sort3d.output());

  this.fft = new RthReconImageFFT();
  this.fft.objectName = "FFT(" + index + ")";
  this.fft.setInput(this.rawSplit.output(-1));

  this.output = function() {
  return this.fft.output();
  };

  this.rawOutput = function() {
    return this.rawSplit.output(-1);
  };

}

function  coilBlock(input,index){
  var that = this;
  this.b1Data = new Array();


  this.router = new RthReconRouteByKeys();
  this.router.objectName = "DATA(Coil " + index + ")";
  // Router index to be altered w.r.t. TR1 and TR2 changes.s
  this.router.setIndexKeys(["acquisition.<interleave>.input"]);
  // This one is not view index, should come from SB hence from control.
  this.router.setMaxIndexKeys(["reconstruction.<interleave>.numInputs"]);
  this.router.observeKeys(["reconstruction.interleaveSteps"]);
  this.router.observedKeysChanged.connect(function(keys){
    var interleaveSteps = keys["reconstruction.interleaveSteps"];
    
    that.b1Data[0] = new reconBlock(that.router.output(0), 0);
    sos0.setInput(index,that.b1Data[0].output());
    pack0.setInput(index,that.b1Data[0].rawOutput());
    rxAtten0.setInput(index, that.b1Data[0].attenOutput());

    that.b1Data[1] = new reconBlock(that.router.output(1), 1);
    sos1.setInput(index,that.b1Data[1].output());
    pack1.setInput(index,that.b1Data[1].rawOutput());
    rxAtten1.setInput(index, that.b1Data[1].attenOutput());
    
    //for (var m=0; m < interleaveSteps; m++){
     // that.b1Data[m] = new reconBlock(that.router.output(m), m);
     // sos.setInput(index,that.b1Data[m].output());
      //that.packCoils.setInput(index, that.b1Data[m].rawOutput());
      // BUNU burada that.b1Data[m].output() vs seklinde al
    //}
  });
  this.router.setInput(input);

  //this.packCoils = new RthReconImagePack();
  //this.packCoils.objectName = "Pack Coils" + index;
// For each `coil we need sort and FFT.
  //this.sos = new RthReconImageSumOfSquares();
  //this.sos.objectName = "SoS" + index;


  //this.splitter = RthReconSplitter();
  //this.splitter.objectName = "splitOutput" + index;
  //this.splitter.setInput(this.sos.output());


  //this.threePlane = new RthImageThreePlaneOutput();
  //this.threePlane.setInput(this.splitter.output(0));
  //this.threePlane.objectName = "gorsel" + index;

  //this.exporter  = new ExportBlock(this.splitter.output(1),index);

}

var coilArray  = new Array();
function connectCoils(coils){
  for (var i = 0; i<coils; i++){
    coilArray[i] = new coilBlock(observer.output(i),i);
  } 
  rth.collectGarbage();
}

observer.coilsChanged.connect(connectCoils);

//var packCoils = new RthReconImagePack();
//packCoils.objectName = "Pack Coils";
// For each `coil we need sort and FFT.
//var sos = new RthReconImageSumOfSquares();



rth.importJS("lib:RthImageThreePlaneOutput.js");

function ExportBlock(input,inputRaw,trName){

  var that = this;

  var date = new Date();

  

  //var imageExport = new RthReconToQmrlab();
  // This is a bit annoying, but the only option for now. 
  this.imageExport = new RthReconImageExport();

  this.changeInformation = new RthReconImageChangeInformation();

  this.reconKeys = new Array();
  this.reconKeys = [
    // Sequence-specific keys
    "mri.SequenceName",
    "mri.ScanningSequence",
    "mri.SequenceVariant",
    "mri.MRAcquisitionType",
    "mri.NumberOfCoils",
    "mri.ExcitationTimeBandwidth",
    "mri.ExcitationDuration",
    "mri.ExcitationType",
    "mri.VoxelSpacing",
    "mri.EchoTime",
    "mri.RepetitionTime",
    "mri.FlipAngle",
    "mri.SliceThickness",
    "reconstruction.phaseEncodes",
    "acquisition.samples",
    "reconstruction.zPartitions",
    "mri.SubjectBIDS",
    "mri.SessionBIDS",
    "mri.AcquisitionBIDS",
    "mri.ExcitationPassBandRippleDB",
    "mri.ExcitationStopBandRippleDB",
    "mri.ExcitationEnforceRFLimit",
    "mri.SpoilerGradientAmplitude",
    "mri.SpoilerGradientDuration",
  // Generic RTHawk keys
  "geometry.TranslationX",
  "geometry.TranslationY",
  "geometry.TranslationZ",
  "geometry.QuaternionW",
  "geometry.QuaternionX",
  "geometry.QuaternionY",
  "geometry.QuaternionZ",
  "geometry.FieldOfViewX",
  "geometry.FieldOfViewY",
  "geometry.FieldOfViewZ",
  "equipment.StationName",
  "equipment.regulatory/chronaxie",
  "equipment.regulatory/coilSar",
  "equipment.regulatory/extremityCoilSar",
  "equipment.regulatory/extremityPeakSar",
  "equipment.regulatory/governingBody",
  "equipment.regulatory/operatingMode",
  "equipment.regulatory/peakSar",
  "equipment.regulatory/reillyPercentage",
  "equipment.regulatory/rheobase",
  "equipment.regulatory/sarScaleFactor",
  "equipment.regulatory/sarUnits",
  "equipment.regulatory/wbSar",
  "equipment.rf/acquisitionDelayResolution",
  "equipment.rf/bodyMaxAvgPower",
  "equipment.rf/localMaxDutyCycle",
  "equipment.rf/localRatedPower",
  "equipment.rf/maxReadoutBw",
  "equipment.rf/maxUniqueReadouts",
  "equipment.rf/rxChannels",
  "equipment.rf/samplingPeriod",
  "equipment.device/acquisitionHost",
  "equipment.coils",
  "equipment.bootTime",
  "equipment.activationDate",
  "equipment.device/manufacturer",
  "equipment.device/manufacturerModelName",
  "equipment.device/deviceSerialNumber",
  "equipment.device/softwareVersions",
  "equipment.device/canChangeDemodulationDelay",
  "equipment.device/controlConnectionBigEndian",
  "equipment.general/apiVersion",
  "equipment.general/currentDateTime",
  "equipment.general/serverVersion",
  "equipment.gradient/dcGain",
  "equipment.gradient/gContIRms",
  "equipment.gradient/nominalRmsGradientLimit",
  "equipment.gradient/nominalRmsSlewSlope",
  "equipment.gradient/samplingPeriod",
  "equipment.gradient/xDbdtDistance",
  "equipment.gradient/xMaximumAmplitude",
  "equipment.gradient/xRiseTime",
  "equipment.gradient/xShimRes",
  "equipment.gradient/xWarpCoefficients",
  "equipment.gradient/yDbdtDistance",
  "equipment.gradient/yMaximumAmplitude",
  "equipment.gradient/yRiseTime",
  "equipment.gradient/yShimRes",
  "equipment.gradient/yWarpCoefficients",
  "equipment.gradient/zDbdtDistance",
  "equipment.gradient/zMaximumAmplitude",
  "equipment.gradient/zRiseTime",
  "equipment.gradient/zShimRes",
  "equipment.gradient/zWarpCoefficients",
  "equipment.hardwareAddress",
  "equipment.InstitutionAddress",
  "equipment.InstitutionalDepartmentName",
  "equipment.InstitutionName",
  "equipment.licenseType",
  "equipment.magnet/fieldStrength",
  "equipment.udiLIC",
  "equipment.udiPCNMajor",
  "equipment.udiPCNPrefix",
  "equipment.udiUMID",
  "equipment.prescan/refVoltage",
  "equipment.prescan/tg",
  "equipment.prescan/maxB1",
  "equipment.prescan/cf",
  "equipment.prescan/nucleus",
  "equipment.prescan/r1",
  "equipment.prescan/r2",
  "equipment.prescan/refPulseInGauss",
  "equipment.prescan/status",
  "equipment.prescan/xs",
  "equipment.prescan/ys",
  "equipment.prescan/zs",
  "equipment.hostManufacturerModelName",
  "equipment.hostSoftwareVersions",
  "equipment.magnet/fieldStrength",
  "acquisition.peakAmplitude",
  "acquisition.readoutReferencePoint",
  "acquisition.resolution",
  "acquisition.samples",
  "acquisition.samplingRate",
  "acquisition.SequenceId",
  "acquisition.slice",
  "acquisition.triggerCount",
  "acquisition.triggerLead",
  "acquisition.timesincetrig",
  "acquisition.view",
  "patient.AdditionalPatientHistory",
  "patient.PatientAge",
  "patient.PatientBirthDate",
  "patient.PatientDisplayName",
  "patient.PatientID",
  "patient.PatientName",
  "patient.PatientSex",
  "patient.PatientWeight",
  "reconstruction.loopIndexNames",
  "reconstruction.blockNames",
  "series.interfaceState", 
  "series.Modality",
  "series.offsetFromUTC",
  "series.PatientPosition",
  "series.PrescribedGeometry",
  "series.ProtocolName",
  "series.SeriesDescription",
  "series.timezone",
  "exportedSeries.BodyPartExamined",
  "exportedSeries.FrameOfReferenceUID",
  "study.DBdtMode",
  "study.ImagedNucleus",
  "study.MagneticFieldStrength",
  "study.ReceiveCoilName",
  "study.StudyDate",
  "study.StudyDescription",
  "study.StudyTime",
  "equipment.prescan/cf",
  ];

  // Siemens specific keys 
  this.siemensKeys = new Array();
  this.siemensKeys = [
    "equipment.gradient/siemens/asCOMP_0/tModuleName",
    "equipment.gradient/siemens/asCOMP_0/tName",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegX_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegY_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegZ_0",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradClipRiseTime",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplFast",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNominal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNormal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplWhisper",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeFast",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayZ",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityZ",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_0",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_1",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_2",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFoVMax",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceLinear",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceQuadratic",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorX",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorY",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorZ",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/tType",
    "equipment.gradient/siemens/asGPAParameters_0/tType",
    "equipment.gradient/siemens/flGSWDAX_0",
    "equipment.gradient/siemens/flGSWDAX_1",
    "equipment.gradient/siemens/flGSWDAX_2",
    "equipment.gradient/siemens/flGSWDAY_0",
    "equipment.gradient/siemens/flGSWDAY_1",
    "equipment.gradient/siemens/flGSWDAY_2",
    "equipment.gradient/siemens/flGSWDAZ_0",
    "equipment.gradient/siemens/flGSWDAZ_1",
    "equipment.gradient/siemens/flGSWDAZ_2",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorX",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorY",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorZ",
    "equipment.gradient/siemens/flSHIMMaxGradOffset",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_0",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_1",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_2",
    "equipment.gradient/siemens/lGSWDtd_0_0",
    "equipment.gradient/siemens/lGSWDtd_0_1",
    "equipment.gradient/siemens/lGSWDtd_0_2",
    "equipment.gradient/siemens/lGSWDtd_0_3",
    "equipment.gradient/siemens/tGradientEngine"
  ];

  // GE specific keys 
  this.geKeys = new Array();
  this.geKeys = [
    "equipment.Signa/Gradient/xrisetime",
    "equipment.Signa/Gradient/yrisetime",
    "equipment.Signa/Gradient/zrisetime",
    "equipment.Signa/Gradient/systemmaxfov",
    "equipment.Signa/Gradient/xamptran",
    "equipment.Signa/Gradient/yamptran",
    "equipment.Signa/Gradient/zamptran",
    "equipment.Signa/Gradient/xfsamp",
    "equipment.Signa/Gradient/yfsamp",
    "equipment.Signa/Gradient/zfsamp",
    "equipment.Signa/Gradient/xirms",
    "equipment.Signa/Gradient/yirms",
    "equipment.Signa/Gradient/zirms",
    "equipment.Signa/Gradient/xiavrgabs",
    "equipment.Signa/Gradient/yiavrgabs",
    "equipment.Signa/Gradient/ziavrgabs",
    "equipment.Signa/Gradient/xps_avghvpwrlimit",
    "equipment.Signa/Gradient/xps_avglvpwrlimit",
    "equipment.Signa/Gradient/xps_avgpdulimit",
    "equipment.Signa/Gradient/psdgraddelayx",
    "equipment.Signa/Gradient/psdgraddelayy",
    "equipment.Signa/Gradient/psdgraddelayz",
    "equipment.Signa/Gradient/psdgradwait",
    "equipment.Signa/Gradient/psdrfwait",
    "equipment.Signa/Gradient/srmode",
    "equipment.Signa/Gradient/slew_arthigh",
    "equipment.Signa/Gradient/slew_artmedium",
    "equipment.Signa/Gradient/maxb1rms",
    "equipment.Signa/Gradient/lcoil",
    "equipment.Signa/Gradient/gradient_coil_temperature_base_c",
    "equipment.Signa/Gradient/gradient_coil_temperature_limit_c",
    "equipment.Signa/Gradient/gradient_coil_time_constant_s",
    "equipment.Signa/Gradient/gradient_coil_power_ss_limit_kw",
    "equipment.Signa/Gradient/dbdtdistx",
    "equipment.Signa/Gradient/dbdtdisty",
    "equipment.Signa/Gradient/dbdtdistz",
    "equipment.Signa/Gradient/gburstime",
    "equipment.Signa/Gradient/gcoiltype",
    "equipment.Signa/Gradient/gmax_arthigh",
    "equipment.Signa/Gradient/gmax_artmedium",
    "equipment.Signa/Gradient/gpeakirms",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coildc_fftpoints",
    "equipment.Signa/MR/rfmaxattenuation",
    "equipment.Signa/MR/rfampftquadratic",
    "equipment.Signa/MR/rfampftlinear",
    "equipment.Signa/MR/rfdelay"
  ];

  this.changeInformation.observeKeys(["equipment.device/manufacturer"]);
  this.imageExport.observedKeysChanged.connect(function(keys){
    if (keys["equipment.device/manufacturer"] == "GE MEDICAL SYSTEMS"){
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.geKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }else{
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.siemensKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }
  
  });


  this.imageExport.observeKeys([
    "mri.SubjectBIDS",
    "mri.SessionBIDS"
  ]);
  this.imageExport.observedKeysChanged.connect(function(keys){

    var exportDirectory = "qMRLabAcq/rthRecon/";
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    //var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileName  = exportDirectory + subjectBIDS + sessionBIDS + trName + "_TB1AFI.dat";
    that.imageExport.setFileName(exportFileName);
  });
  
  this.imageExport.objectName = "save_image" + trName;
  
  this.imageExport.setInput(input);

  this.imageExportRaw = new RthReconImageExport();
  this.imageExportRaw.objectName = "save_raw" + trName;
  this.imageExportRaw.observeKeys([
    "mri.SubjectBIDS",
    "mri.SessionBIDS"
  ]);
  this.imageExportRaw.observedKeysChanged.connect(function(keys){
    var exportDirectory = "qMRLabAcq/rthRaw/";
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    //var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileNameRaw  = exportDirectory + subjectBIDS + sessionBIDS + trName + "_TB1AFIraw.dat";
    that.imageExportRaw.setFileName(exportFileNameRaw);
  });

  this.imageExportRaw.setInput(inputRaw);
  this.imageExportRaw.setKSpace(kspace);

  //this.imageExport.saveFileSeries(true);

}


//var splitter = RthReconSplitter();
//splitter.objectName = "splitOutput";
//splitter.setInput(sos.output());

//var threePlane = new RthImageThreePlaneOutput();
//threePlane.setInput(splitter.output(0));

//var exporter  = new ExportBlock(splitter.output(1),packCoils.output());

var rxAtten0 = new RthReconRawApplyRxAttenuation();
rxAtten0.objectName = "Rx Atten 0";
rxAtten0.lowerLimit = 0.3;
rxAtten0.upperLimit = 0.75;
rxAtten0.newAttenuation.connect(function(newAtten) {
  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "sequence", "setRxAttenuation", "", newAtten));
});

var rxAtten1 = new RthReconRawApplyRxAttenuation();
rxAtten1.objectName = "Rx Atten 1";
rxAtten1.lowerLimit = 0.3;
rxAtten1.upperLimit = 0.75;
rxAtten1.newAttenuation.connect(function(newAtten) {
  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "sequence", "setRxAttenuation", "", newAtten));
});

var sos0 = new RthReconImageSumOfSquares();
sos0.objectName = "SoS0";

var sos1 = new RthReconImageSumOfSquares();
sos1.objectName = "SoS1";

var pack0 = new RthReconImagePack();
pack0.objectName = "coilPack0";

var pack1 = new RthReconImagePack();
pack1.objectName = "coilPack1";

var splitter0 = RthReconSplitter();
splitter0.objectName = "splitOutput 0";
splitter0.setInput(this.sos0.output());

var splitter1 = RthReconSplitter();
splitter1.objectName = "splitOutput 1";
splitter1.setInput(this.sos1.output());

threePlane0 = new RthImageThreePlaneOutput();
threePlane0.setInput(this.splitter0.output(0));

threePlane1 = new RthImageThreePlaneOutput();
threePlane1.setInput(this.splitter1.output(0));

exporter0  = new ExportBlock(this.splitter0.output(1),pack0.output(),'_acq-tr1');
exporter1  = new ExportBlock(this.splitter1.output(1),pack1.output(),'_acq-tr2');