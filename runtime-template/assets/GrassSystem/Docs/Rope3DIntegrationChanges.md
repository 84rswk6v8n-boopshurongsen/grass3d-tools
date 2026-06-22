# Rope3D Integration Changes

## Files changed

- `assets/rope3d/scripts/Rope3D.ts`
- `assets/rope3d/scripts/RopeSolver3D.ts`

## Added API

```ts
getPositionsSnapshot(out?: Vec3[]): Vec3[]
getRopeRadius(): number
```

## Phase-two grass interaction

Rope3D now has a dedicated `Grass Interaction` inspector group:

- `grassInteractionEnabled`
- `grassRoot`
- `grassRopeWeight`
- `grassSupportScale`
- `grassDragScale`
- `grassRecoveryScale`
- `grassMaxAcceleration`

These settings let grass apply visual-feel support, resistance, and recovery push to rope particles. The solver consumes a read-only callback supplied by `Rope3D`; it does not own GrassSystem state.

## Why

The grass system needs read-only rope segment data so each rope segment can affect nearby grass like a capsule. The added methods expose a copied snapshot of the current simulated rope points and the configured rope radius without exposing mutable internal arrays.

## Behavior impact

The existing rope simulation, rendering, collision, and public inspector fields are preserved. Inspector labels were rebuilt into clean UTF-8/ASCII text because the old file contained corrupted label strings. Serialized field names were kept so the demo scene bindings continue to load.
