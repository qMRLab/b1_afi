## RTHawk Application - Actual Flip Angle B1+ mapping 

## Required configurations 

`RTHawk.cfg` on scanner workstation should contain:

```
hardware]
useAbsoluteGradientLimits=true
```

## Steps 

1. Clone this repository to the `HeartVista/Applications` directory
2. Create the following folders and subfolders under `HeartVista/Storage` directory
```
├── /RawImage
    └── /qMRLabAcq  
        ├── /rthRecon
        └── /rthRaw 
```
3. Add `B1 AFI` to a protocol
4. Connect RTHawk to the scanner as usual 
5. Upon loading, you will see the following message on the terminal window on which RTHawk is running: 

```
====================== REQUIRED ================================"
TR1Duration in InterleavedCartesian3D.spv should be : TR1-required-value
TR2Duration in InterleavedCartesian3D.spv should be : TR2-required-value
====================== CURRENT =================================");
Current TR1 duration in spv: Current-TR1-value
Current TR2 duration in spv: Current-TR2-value
```
6. **If** `TR1-required-value` is not equal to `Current-TR1-value`, please open `InterleavedCartesian3D.spv` in SpinBench and update respective values using the `JavaScript Relationship` plugin. This is a temporary solutoin to fix TR1/TR2 at 25/50ms on different scanners, as interleaved TR durations cannot be set from `control.js` at this time. 
7. If 6 is not an issue, you can run the scan. You will find outputs saved to `qMRLabAcq` subfolders.

## BIDS panel 

You can define `subject` and `session` values for a scan. Note that output data (`*.dat`) will be saved in BIDS compatible file names and metadata fields. Please make sure that you provide a unique subject/session ID per scan. 

### Preset protocols 

* TR1 25ms `InterleavedCartesian3D.spv`
* TR2 50ms `InterleavedCartesian3D.spv`
* TE  3.5 `EchoDelay` and `InterleavedCartesian3D.spv`
* FA  60 `SlabSelectMFSLR.spv`
* Pulse Minimum-phase SLR `SlabSelectMFSLR.spv`
