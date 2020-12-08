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
observer.observeValueForKey("acquisition.samples", "samples");


function reconBlock(input) {
  
  var that  = this;
  //this.sort = new RthReconRawToImageSort();
  
  //this.sort.observeKeys(["acquisition.samples","reconstruction.phaseEncodes","reconstruction.partitions"]);
  //this.sort.observedKeysChanged.connect(function(keys){
   // that.sort.setPhaseEncodes(keys["reconstruction.phaseEncodes"]);
    //that.sort.setSamples(keys["acquisition.samples"]);
    //that.sort.setSliceEncodes(keys["reconstruction.zPartitions"]);
    //that.sort.setAccumulate(keys["reconstruction.phaseEncodes"]*keys["reconstruction.zPartitions"]);
  //});
  
 this.sort3d = new RthReconSort();
 this.sort3d.setIndexKeys(["acquisition.<Cartesian Readout>.index", "acquisition.<Repeat 1>.index"]);
 this.sort3d.setInput(input);
 this.sort3d.observeKeys(["mri.RunNumber"]);
 this.sort3d.observedKeysChanged.connect(
  function(keys) {
    that.sort3d.resetAccumulation();
    var yEncodes = keys["reconstruction.phaseEncodes"];
    var samples = keys["acquisition.samples"];
    //var coils = keys["acquisition.channels"];
    var zEncodes = keys["reconstruction.zPartitions"];
    //this.sort3d.extent = [samples, coils, yEncodes, zEncodes]; // if the input is [samples x coils]
    that.sort3d.extent = [samples, yEncodes, zEncodes]; // if the input is [samples]
    that.sort3d.accumulate = yEncodes * zEncodes;
  }
);

  //this.sort = RthReconSort();
  //this.sort.setIndexKeys(["acquisition.index"]);
  //this.sort.setInput(input);
  //this.sort.setUseSliceEncodeKey(false);
  //this.sort.setSwapSePe(true);
  //this.sort.observeKeys(["acquisition.slice", "acquisition.index"]);
  //this.sort.observedKeysChanged.connect(function(keys){
    //RTHLOGGER_WARNING("Slice" + keys["acquisition.slice"] + "index" + keys["acquisition.index"]);
  //});
  //this.sort.observeKeys(["acquisition.<Repeat 1>.index"]);
  //this.sort.observedKeysChanged.connect(function(keys){
  //  RTHLOGGER_WARNING("Slice" + keys["acquisition.<Repeat 1>.index"]);
  //});
  //this.sort.setExtent([256,256])
  //this.sort.setAccumulate(2*256);
  this.fft = new RthReconImageFFT();
  this.fft.setInput(this.sort3d.output());

  this.output = function() {
  return this.fft.output();
  };
}

// For each `coil we need sort and FFT.

var sos = new RthReconImageSumOfSquares();
var block  = [];

function connectCoils(coils){
  block = [];
  for (var i = 0; i<coils; i++){
    block[i] = new reconBlock(observer.output(i));
    sos.setInput(i,block[i].output());
  }
 rth.collectGarbage();
}

observer.coilsChanged.connect(connectCoils);

rth.importJS("lib:RthImageThreePlaneOutput.js");

function ExportBlock(input){

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
    "mri.FlipAngle1",
    "mri.FlipAngle2",
    "mri.FlipAngle", // Belonging to the current loop
    "mri.SliceThickness",
    "reconstruction.phaseEncodes",
    "acquisition.samples",
    "reconstruction.zPartitions",
    "mri.PreAcqDuration",
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
    "mri.SessionBIDS",
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
    that.imageExport.addTag("FlipAngle1",keys["mri.FlipAngle1"]);
    that.imageExport.addTag("FlipAngle2",keys["mri.FlipAngle2"]);
    that.imageExport.addTag("FlipAngle",keys["mri.FlipAngle"]);
    that.imageExport.addTag("SliceThickness",keys["mri.SliceThickness"]);
    that.imageExport.addTag("NumberOfRows",keys["reconstruction.phaseEncodes"]);
    that.imageExport.addTag("NumberOfColumns",keys["acquisition.samples"]);
    that.imageExport.addTag("PreAcqDuration",keys["mri.PreAcqDuration"]);
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
    var exportDirectory = "/home/agah/Desktop/AgahHV/";
    var flipIndex = keys["mri.FlipIndex"];
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileName  = exportDirectory + subjectBIDS + sessionBIDS + acquisitionBIDS + "_flip-" + flipIndex + "_VFAT1.dat";
    that.imageExport.setFileName(exportFileName);

  });
  
  //this.imageExport.observeKeys(["mri.RunNumber", // Ensured that this one will change per run.
  //                              "mri.SubjectBIDS",
  //                              "mri.SessionBIDS",
  //                              "mri.AcquisitionBIDS"  
  //]);
  //this.imageExport.observedKeysChanged(function(keys){
  //  var flipIndex = keys["mri.RunNumber"] + 1;
  //  var subjectBIDS  = "sub-" + keys["mri.SessionBIDS"]; 
  //  var sessionBIDS = (keys["mri.SessionBIDS"]!=="") ? "_ses-" + keys["mri.SessionBIDS"] : "";
  //  var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]!=="") ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
  //});

  //var exportDirectory = "/home/agah/Desktop/AgahHV/";
  //var exportFileName  = exportDirectory + subjectBIDS + sessionBIDS + acquisitionBIDS + "_flip-" + flipIndex + '_VFAT1.dat';
  this.imageExport.objectName = "save_image";
  
  this.imageExport.setInput(input);
  
  RTHLOGGER_WARNING("saving...");

  //this.imageExport.saveFileSeries(true);

  // This is a sink node, hence no output.
}


var splitter = RthReconSplitter();
splitter.objectName = "splitOutput";
splitter.setInput(sos.output());


var threePlane = new RthImageThreePlaneOutput();
threePlane.setInput(splitter.output(0));

var exporter  = new ExportBlock(splitter.output(1));
