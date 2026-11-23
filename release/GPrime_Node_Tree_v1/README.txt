GPrime Multi Touch Clip Node Tree v1.0
Galaxy Scopez — https://vidarandersen.com/dmz/galaxyscopez/#gprime

INSTALL
Extract this folder. Keep GPrime_Node_Tree_v1.drx beside the matching .png.
On Resolve's Color page, open Gallery and select a PowerGrade album.
Right-click in the album, choose Import, and select the .drx file.
Before grading, select the intended ungraded clips and apply this PowerGrade
using the Gallery still's Apply Grade command. This replaces existing grades.
Check one clip's tree, configure your transforms, then start grading.

ASSIGN IN GALAXY SCOPEZ
Choose GPrime and open Settings > GPrime > Fetch nodes from current clip.
Bind Exposure to EXPOSURE, Contrast to CONTRAST/RATIO, Balance to BALANCE,
and Saturation to SATURATION. Sat Gamma and Sat Gain share the Saturation node.
Exposure and Balance use Linear gamma. Contrast Pivot is 0.336 for DWG/Intermediate.
Saturation uses HSV with only channel 2 (S) enabled; H and V are disabled.

COLOUR MANAGEMENT
This tree is intended for DaVinci Wide Gamut / DaVinci Intermediate grading.
The ->DWG input CST is disabled as supplied. Configure its input for your footage
and enable it only if conversion to DWG/Intermediate is needed.
Use the appropriate output/display transform in your own Timeline node tree.
Keep GTap after the output transform, normally as the last Timeline node.
The DRX also retains Timeline-level data referencing the separate Referent
Apple Log 2 to Rec.709 LUT and GTap. Do not assume that is your display transform.
Referent is not bundled. Obtain the matching LUT separately from Cullen Kelly:
https://cullenkellycolor.com/toolkit/referent

The supplied DRX and matching still have not been altered.
The extra correction/window/NR/Trim nodes are optional.
Full instructions and supported setup are in the guide linked above.
