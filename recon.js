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
  
// acquisition.<Cartesian Readout>.index --> 0 to 123 
// acquisition.<inter>.input --> 0/1 
 this.sort3d = new RthReconSort();
 this.sort3d.objectName = "TRNumber(" + index + ")";
 this.sort3d.setIndexKeys(["acquisition.<Cartesian Readout>.index","acquisition.<zPartition" + index + ">.index"]);
 this.sort3d.setInput(input);
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

    that.b1Data[1] = new reconBlock(that.router.output(1), 1);
    sos1.setInput(index,that.b1Data[1].output());
    pack1.setInput(index,that.b1Data[1].rawOutput());
    
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
  this.imageExport.observeKeys([
    // For now, addTag does not support type string. 
    //"mri.SequenceName",
    //"mri.ScanningSequence",
    //"mri.SequenceVariant",
    //"mri.MRAcquisitionType",
    "mri.NumberOfCoils",
    "mri.ExcitationTimeBandwidth",
    "mri.ExcitationDuration",
    //"mri.ExcitationType",
    "mri.VoxelSpacing",
    "mri.EchoTime",
    "mri.RepetitionTime",
    "mri.FlipAngle", // Belonging to the current loop
    "mri.SliceThickness",
    "reconstruction.phaseEncodes",
    "acquisition.samples",
    "reconstruction.zPartitions",
    //"mri.PreAcqDuration",
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
    "mri.FlipIndex", // Ensured that this one will change per run.
    "mri.SubjectBIDS",
    //"mri.SessionBIDS",
    "mri.AcquisitionBIDS"  
  ]);
  this.imageExport.observedKeysChanged.connect(function(keys){
    that.imageExport.addTag("NumberOfCoils",keys["mri.NumberOfCoils"]);
    that.imageExport.addTag("ExcitationTimeBandwidth",keys["mri.ExcitationTimeBandwidth"]);
    that.imageExport.addTag("ExcitationDuration",keys["mri.ExcitationDuration"]);
    that.imageExport.addTag("SpacingX",keys["mri.VoxelSpacing"][0]);
    that.imageExport.addTag("SpacingY",keys["mri.VoxelSpacing"][1]);
    that.imageExport.addTag("SpacingZ",keys["mri.VoxelSpacing"][2]);
    that.imageExport.addTag("EchoTime",keys["mri.EchoTime"]);
    that.imageExport.addTag("RepetitionTime",keys["mri.RepetitionTime"]);
    that.imageExport.addTag("FlipAngle",keys["mri.FlipAngle"]);
    that.imageExport.addTag("SliceThickness",keys["mri.SliceThickness"]);
    that.imageExport.addTag("NumberOfRows",keys["reconstruction.phaseEncodes"]);
    that.imageExport.addTag("NumberOfColumns",keys["acquisition.samples"]);
    //that.imageExport.addTag("PreAcqDuration",keys["mri.PreAcqDuration"]);
    that.imageExport.addTag("TranslationX",keys["geometry.TranslationX"]);
    that.imageExport.addTag("TranslationY",keys["geometry.TranslationY"]);
    that.imageExport.addTag("TranslationZ",keys["geometry.TranslationZ"]);
    that.imageExport.addTag("QuaternionW",keys["geometry.QuaternionW"]);
    that.imageExport.addTag("QuaternionX",keys["geometry.QuaternionX"]);
    that.imageExport.addTag("QuaternionY",keys["geometry.QuaternionY"]);
    that.imageExport.addTag("QuaternionZ",keys["geometry.QuaternionZ"]);
    that.imageExport.addTag("FieldOfViewX",keys["geometry.FieldOfViewX"]);
    that.imageExport.addTag("FieldOfViewY",keys["geometry.FieldOfViewY"]);
    that.imageExport.addTag("FieldOfViewZ",keys["geometry.FieldOfViewZ"]);
    that.imageExport.addTag("YYYMMDD",date.getFullYear() + date.getMonth() + date.getDay());
    var exportDirectory = "/home/agah/Desktop/qmrlabAcq/rthRecon/";
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
    "mri.FlipIndex", // Ensured that this one will change per run.
    "mri.SubjectBIDS",
    //"mri.SessionBIDS",
    "mri.AcquisitionBIDS"  
  ]);
  this.imageExportRaw.observedKeysChanged.connect(function(keys){
    var exportDirectory = "/home/agah/Desktop/qmrlabAcq/rthRaw/";
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