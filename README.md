# Grass3D Tools

Grass3D Tools is a Cocos Creator 3.8.x editor extension for creating interactive 3D grass scenes.

## Resource Overview

Current version: `0.1.2`.

The extension installs the GrassSystem runtime template into `assets/GrassSystem` when needed, then creates a standard Grass3D node setup from the editor menu or hierarchy context menu.

The runtime template includes:

- Batched grass blade mesh generation.
- Mesh-surface grass sampling.
- Optional grayscale density textures.
- Wind animation, color variation, LOD thinning, and distance fade.
- Sphere, capsule, box, rigid body, and Rope3D rope interaction.
- `GrassRigidbodyReaction` for optional support, drag, and recovery push on dynamic rigid bodies.
- Demo materials, textures, shader effect, scripts, and sample scene.

## Version 0.1.2 Updates

- Added density texture runtime assets and demo density maps.
- Added `GrassBladeGPU.effect` for grass material/shader iteration.
- Added `GrassRigidbodyReaction` runtime script.
- Updated Rope3D grass interaction support.
- Updated automatic runtime installation checks.
- Added Cocos Creator import zip and manual installation zip.

## Editor Entries

- Top menu: `Node / 3d草地`
- Hierarchy context menu: `Create / 3D Object / 3d草地`
- Fallback context menu entry: `3d草地`

## Creation Result

Creating a Grass3D node adds:

- `Grass3D`
- `InteractionManager`
- `GrassSource_Mesh`
- `GrassSurface_BatchedBlades`

The created grass surface is connected to the demo grass material, ground material, and density texture when the corresponding assets are available.

## Installation Packages

- `grass3d-tools-0.1.2-cocos-import.zip`: import through the Cocos Creator extension manager.
- `grass3d-tools-0.1.2-manual.zip`: unzip manually into the Cocos Creator extensions directory.
