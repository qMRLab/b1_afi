/*
================== qMRLab vfa_t1 pulse sequence = 
This is the controller script which is responsible for 
passing the variables between the GUI (control.ui) and 
RTHawk's sequencing engine.    

Waveforms exported by SpinBench and described by application.apd
determine the initial state of the sequence. For this 
application, initial parameters are fetched from: 

- [excitation] SincRF + Z (SlabSelect.spv)
- [echodelay] in us, to be exposed to GUI. (Not linked to a file)
- [readout] 3D Cartesian Readout (CartesianReadout3D.spv)
- [spoiler] Area Trapezoid  (SpoilerGradient.spv)

Author:  Agah Karakuzu agahkarakuzu@gmail.com
Created: October, 2019. 
// =================================================
*/

// Get sequence ID
var sequenceId  = rth.sequenceId();
// Import display tool

rth.importJS("lib:RthDisplayThreePlaneTools.js");
var displayTools = new RthDisplayThreePlaneTools();

// Fetch initial parameters described in CartesianReadout3D.spv 
var xPixels = SB.sequence["<Cartesian Readout>.xRes"]; // Number of samples, no need for this, acquisition emits this. 
var phaseEncodes = SB.sequence["<Cartesian Readout>.yRes"]; // Number of repeats 
var zPartitions = SB.sequence["<Phase Encode Gradient>.res"]; // Number of partitions (has attr fov as well)
var interleaveSteps = SB.sequence["<interleave>.numInputs"];

var rectSelected = true;
var sincSelected = false;

// These values are changed in the SB only.
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, {
  phaseEncodes: phaseEncodes,
  zPartitions: zPartitions
}));
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "<interleave>.numInputs", SB.sequence["<interleave>.numInputs"]));
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "interleaveSteps", interleaveSteps));
for (var i = 0; i < interleaveSteps; i++) {
  rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "<zPartition" + i + ">.repetitions", SB.sequence["<zPartition" + i + ">.repetitions"]));
}

// Get the sequence parameters from the sequencer.
var scannerParameters = new RthUpdateGetParametersCommand(sequenceId);
rth.addCommand(scannerParameters);
var parameterList = scannerParameters.receivedData();

var instanceName = rth.instanceName();

rth.addSeriesDescription(instanceName);

rth.informationInsert(sequenceId, "mri.SequenceName", "qMRLab " + instanceName);
rth.informationInsert(sequenceId, "mri.ScanningSequence", "GR");
rth.informationInsert(sequenceId, "mri.SequenceVariant", "SS, SP");
rth.informationInsert(sequenceId, "mri.ScanOptions", "");
rth.informationInsert(sequenceId, "mri.MRAcquisitionType", "3D");
rth.informationInsert(sequenceId, "mri.NumberOfAverages", 1);
rth.informationInsert(sequenceId, "mri.NumberOfCoils", parameterList[2]);
rth.informationInsert(sequenceId, "mri.EchoTrainLength", 1);

// Get minimum TR
var scannerTR = new RthUpdateGetTRCommand(sequenceId, [], []);
rth.addCommand(scannerTR);
var minTR = scannerTR.tr();
var startingTR = 20;
rth.addCommand(new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", (startingTR)*1000));
rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "RepetitionTime", startingTR));
RTHLOGGER_WARNING("Minimum TR: " + minTR);

// Starting FOV also depends on CartesianReadout3D.spv
// In SpinBench, FOV is defined in cm. xFOV = yFOV always. 
var startingFOV = SB.sequence["<Cartesian Readout>.fov"]; // cm
var startingZFOV = SB.sequence["<Phase Encode Gradient>.fov"]; //cm

var startingResolution = startingFOV/xPixels* 10; // mm

// These params are agnostic to the RF selection
// For SS this would correspond to ssg thickness, but in absence it is PEZ FOV.
// In VFA T1 SS 48 but PEZ FOV is 50 (just followed a buffer convention I saw in other apps.)
// TODO: Match these xross apps.
var startingThickness = startingZFOV; // mm
displayTools.setSliceThickness(startingThickness*10);
rth.informationInsert(sequenceId,"mri.SliceThickness",startingThickness);
rth.informationInsert(sequenceId,"mri.VoxelSpacing",[fieldOfView/xPixels*10,fieldOfView/phaseEncodes*10,startingZFOV/zPartitions*10]);

// To store the current values 
var sliceThickness = startingThickness;
var fieldOfView = startingFOV;

var repetitionTime = startingTR;



// Change functions

function changeFOV(fov){
  if (fov<startingFOV) fov = startingFOV; 
  var scale = startingFOV/fov;
  // Scale gradients (x,y,z) assuming in-plane isometry
  rth.addCommand(new RthUpdateScaleGradientsCommand(sequenceId,"readout",scale,scale, 1));
  // Waveforms are not affected by the below: 
  rth.addCommand(new RthUpdateChangeResolutionCommand(sequenceId,startingResolution/scale));
  rth.addCommand(new RthUpdateChangeFieldOfViewCommand(sequenceId, fov*10,fov*10,1));
  // Annotation
  displayTools.setFOV(fov * 10);
  //displayTool.setResolution(startingResolution/scale,startingResolution/scale);
  // Update
  fieldOfView = fov;
}

// Send metadata to recon
rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
  NumberOfCoils: parameterList[2]
  //PreAcqDuration: SB.sequence["<Preacquisitions>.duration"]
}));


controlWidget.inputWidget_FOV.minimum = startingFOV;
controlWidget.inputWidget_FOV.maximum = startingFOV*2;
controlWidget.inputWidget_FOV.value   = startingFOV;


function sessionClicked(chck){

  if (chck){
    controlWidget.sessionBIDS.enabled = true;
    controlWidget.sessionBIDS.setText("00");
  }else{
    controlWidget.sessionBIDS.enabled = false;
    controlWidget.sessionBIDS.text = "";
    controlWidget.sessionBIDS.placeholderText = "_ses-<index>";
  }
}

function acqClicked(chck){

  if (chck){
    controlWidget.acqBIDS.enabled = true;
    controlWidget.acqBIDS.setText("freeform");
  }else{
    controlWidget.acqBIDS.enabled = false;
    controlWidget.acqBIDS.text = "";
    controlWidget.acqBIDS.placeholderText = "_acq-<label>";
  }
}


var acqLabel = "";
function acqTextChanged(txt){
  acqLabel = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"AcquisitionBIDS",acqLabel));

}

var sesIndex = "";
function sesTextChanged(txt){
  sesIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SessionBIDS",sesIndex));

}

var subIndex = "";
function subTextChanged(txt){
  subIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SubjectBIDS",subIndex));


}

// Connect UI elements to the callback functions.

controlWidget.acqBIDS.textChanged.connect(acqTextChanged);
acqTextChanged(controlWidget.acqBIDS.text);

controlWidget.sessionBIDS.textChanged.connect(sesTextChanged);
sesTextChanged(controlWidget.sessionBIDS.text);

controlWidget.subjectBIDS.textChanged.connect(subTextChanged);
subTextChanged(controlWidget.subjectBIDS.text);

controlWidget.isSessionBIDS.toggled.connect(sessionClicked);
sessionClicked(controlWidget.isSessionBIDS.checked)

controlWidget.isAcqBIDS.toggled.connect(acqClicked);
acqClicked(controlWidget.isAcqBIDS.checked)

controlWidget.inputWidget_FOV.valueChanged.connect(changeFOV);
changeFOV(controlWidget.inputWidget_FOV.value);

rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
  SubjectBIDS: controlWidget.subjectBIDS.text,
  SessionBIDS: controlWidget.sessionBIDS.text,
  AcquisitionBIDS: controlWidget.acqBIDS.text
}));