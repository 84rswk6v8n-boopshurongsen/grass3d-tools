# GrassSystem

Phase-two Cocos Creator 3.8.x grass system for Web targets.

## What is included

- Mesh-surface grass sampling by triangle area.
- Optional UV density texture sampling. Black means no grass, white means full density.
- Batched grass blade mesh generation. Grass is not created as one node per blade.
- Wind, height/width/color randomness, distance fade, LOD thinning, and shadow toggles.
- Interaction from sphere, capsule, box, and rope line segments into grass.
- Grass reaction sampling for visual-feel support, drag, and recovery push.
- Optional grass feedback into dynamic rigid bodies via `GrassRigidbodyReaction`.
- Optional Rope3D grass interaction settings for rope weight, support, drag, and max acceleration.
- An editor-authored demo scene with adjustable nodes, colliders, rope interaction, materials, and scripts.

## Current phase boundary

Phase two uses a visual-feel force field instead of per-blade rigid bodies. Grass can slow, support, and lightly push back rigid bodies and Rope3D, but it does not simulate every blade as an individual physics object.

Density texture editing/painting is still out of scope. The demo reads an existing PNG density map from `assets/GrassSystem/textures/GrassDensity_TestPattern.png`.

The test density map is intentionally graphic: full white, full black, gray gradient, checkerboard, and center guide lines. It is meant to make UV direction and grayscale density behavior easy to verify.

## Recommended demo setup

Open `assets/GrassSystem/scenes/GrassSystemDemo.scene`. The demo contains editor-created nodes for the camera, light, source mesh, generated grass surface, density texture, a keyboard-controlled box interactor, a dynamic sphere using `GrassRigidbodyReaction`, and the real Rope3D interactor.

The source mesh and demo interactors use `GrassDemoPrimitive` only to rebuild their own display mesh in edit/runtime; the nodes themselves are authored in the scene and can be adjusted from the editor.

Controls:

- `W/A/S/D`: move the Rope3D end anchor on XZ.
- `Q/E`: shorten or lengthen the Rope3D target length.
- `I/J/K/L`: move the box interactor on XZ.

## Phase-two tuning

- `GrassSurface.maxBlades`: demo target is `5000`.
- `GrassSurface.densityMap`: grayscale UV density map. Black removes grass, white keeps full density.
- `GrassSurface.bendResistance`: grass support strength.
- `GrassSurface.reactionDrag`: resistance applied against object motion through grass.
- `GrassSurface.recoveryPush`: bent grass pushing back while recovering.
- `Rope3D > Grass Interaction`: rope-side controls for rope weight, grass support, drag, recovery push, and maximum acceleration.
- `GrassRigidbodyReaction`: attach to dynamic rigid bodies that should receive grass support and drag.
