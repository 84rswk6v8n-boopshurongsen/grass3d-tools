import { Vec3 } from 'cc';

export enum GrassInteractorShape {
    Sphere = 0,
    Capsule = 1,
    Box = 2,
}

export type GrassSphereInfluence = {
    type: GrassInteractorShape.Sphere;
    center: Vec3;
    radius: number;
    strength: number;
    recovery: number;
};

export type GrassCapsuleInfluence = {
    type: GrassInteractorShape.Capsule;
    start: Vec3;
    end: Vec3;
    radius: number;
    strength: number;
    recovery: number;
};

export type GrassBoxInfluence = {
    type: GrassInteractorShape.Box;
    center: Vec3;
    axisX: Vec3;
    axisY: Vec3;
    axisZ: Vec3;
    halfExtents: Vec3;
    strength: number;
    recovery: number;
};

export type GrassInfluence = GrassSphereInfluence | GrassCapsuleInfluence | GrassBoxInfluence;

export type GrassReactionOptions = {
    supportScale?: number;
    dragScale?: number;
    recoveryScale?: number;
    densityScale?: number;
    maxForce?: number;
};

export type GrassBlade = {
    index: number;
    root: Vec3;
    normal: Vec3;
    tangent: Vec3;
    bitangent: Vec3;
    height: number;
    width: number;
    colorJitter: number;
    seed: number;
    bend: Vec3;
    bendVelocity: Vec3;
    targetBend: Vec3;
    crush: number;
    targetCrush: number;
    interaction: number;
    targetInteraction: number;
    recovery: number;
    lod: number;
};
