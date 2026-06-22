import {
    _decorator,
    Camera,
    Color,
    Component,
    gfx,
    Material,
    Mat4,
    Mesh,
    MeshRenderer,
    Node,
    Texture2D,
    utils,
    Vec2,
    Vec3,
} from 'cc';
import { GrassInteractionManager } from './GrassInteractionManager';
import { GrassBlade, GrassInfluence, GrassInteractorShape, GrassReactionOptions } from './GrassTypes';

const { ccclass, property, requireComponent, menu, executeInEditMode } = _decorator;

type TriangleSample = {
    a: Vec3;
    b: Vec3;
    c: Vec3;
    na: Vec3;
    nb: Vec3;
    nc: Vec3;
    uva: Vec2;
    uvb: Vec2;
    uvc: Vec2;
    area: number;
    cumulativeArea: number;
};

const TMP_A = new Vec3();
const TMP_B = new Vec3();
const TMP_C = new Vec3();
const TMP_D = new Vec3();
const TMP_E = new Vec3();
const TMP_F = new Vec3();
const TMP_G = new Vec3();
const TMP_H = new Vec3();
const TMP_I = new Vec3();
const TMP_J = new Vec3();
const TMP_K = new Vec3();
const TMP_L = new Vec3();
const TMP_MAT_A = new Mat4();
const TMP_MAT_B = new Mat4();

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function hash01(seed: number) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
}

const GROUP_SOURCE = '来源';
const GROUP_SCATTER = '撒草';
const GROUP_SHAPE = '草形';
const GROUP_COLOR = '颜色';
const GROUP_WIND = '风';
const GROUP_INTERACTION = '交互压弯';
const GROUP_CRUSH = '压倒';
const GROUP_REACTION = '草地反作用';
const GROUP_LOD = 'LOD';
const GROUP_RENDERING = '渲染';
const GROUP_PERFORMANCE = '性能';

@ccclass('GrassSurface')
@menu('GrassSystem/Grass Surface')
@executeInEditMode
@requireComponent(MeshRenderer)
export class GrassSurface extends Component {
    private static readonly _activeSurfaces = new Set<GrassSurface>();

    @property({ type: MeshRenderer, group: GROUP_SOURCE, displayName: '源模型', tooltip: '用于撒草的模型渲染器，草会根据该模型的三角面和 UV 生成。' })
    public sourceRenderer: MeshRenderer | null = null;

    @property({ type: Material, group: GROUP_SOURCE, displayName: '草材质', tooltip: '草片渲染使用的材质，默认使用 GrassBladeGPU Shader。' })
    public grassMaterial: Material | null = null;

    @property({ type: Texture2D, group: GROUP_SOURCE, displayName: '密度图', tooltip: '按源模型 UV 采样的密度贴图，颜色越亮生成草的概率越高。' })
    public densityMap: Texture2D | null = null;

    @property({ type: Camera, group: GROUP_SOURCE, displayName: 'LOD 相机', tooltip: '用于距离裁剪和淡出的相机；为空时不按相机距离做 LOD。' })
    public lodCamera: Camera | null = null;

    @property({ group: GROUP_SOURCE, displayName: '启动时重建', tooltip: '运行开始时自动重新生成草地。' })
    public rebuildOnStart = true;

    @property({ group: GROUP_SCATTER, displayName: '草密度', tooltip: '每平方米尝试生成的草数量，最终数量还会受密度图和最大草数限制。' })
    public densityPerSquareMeter = 40;

    @property({ group: GROUP_SCATTER, displayName: '最大草数', tooltip: '当前草地允许生成的最大草片数量。' })
    public maxBlades = 3000;

    @property({ group: GROUP_SCATTER, displayName: '草片分段', tooltip: '单根草沿高度方向的网格分段，越高弯曲越平滑但顶点更多。' })
    public bladeSegments = 3;

    @property({ group: GROUP_SHAPE, displayName: '最小高度', tooltip: '单根草的随机最小高度。' })
    public minHeight = 0.28;

    @property({ group: GROUP_SHAPE, displayName: '最大高度', tooltip: '单根草的随机最大高度。' })
    public maxHeight = 0.72;

    @property({ group: GROUP_SHAPE, displayName: '最小宽度', tooltip: '单根草根部的随机最小宽度。' })
    public minWidth = 0.025;

    @property({ group: GROUP_SHAPE, displayName: '最大宽度', tooltip: '单根草根部的随机最大宽度。' })
    public maxWidth = 0.06;

    @property({ type: Color, group: GROUP_COLOR, displayName: '根部颜色', tooltip: '草片根部颜色。' })
    public rootColor = new Color(40, 95, 36, 255);

    @property({ type: Color, group: GROUP_COLOR, displayName: '尖端颜色', tooltip: '草片尖端颜色。' })
    public tipColor = new Color(128, 190, 80, 255);

    @property({ group: GROUP_COLOR, displayName: '颜色随机', tooltip: '每根草的颜色随机幅度，用于打散重复感。' })
    public colorRandomness = 0.18;

    @property({ group: GROUP_WIND, displayName: '风强度', tooltip: 'Shader 风场的摆动强度。' })
    public windStrength = 0.11;

    @property({ group: GROUP_WIND, displayName: '风尺度', tooltip: '风场空间变化尺度，越大风向变化越密。' })
    public windScale = 0.75;

    @property({ group: GROUP_WIND, displayName: '风速度', tooltip: '风动画播放速度。' })
    public windSpeed = 1.3;

    @property({ group: GROUP_WIND, displayName: '交互抑制风', tooltip: '草被碰撞体压弯时，降低同区域风摆动的比例。' })
    public interactionWindSuppression = 0.88;

    @property({ group: GROUP_WIND, displayName: '逆向风抑制', tooltip: '风向和碰撞压弯方向相反时的抑制强度。' })
    public opposingWindSuppression = 0.95;

    @property({ group: GROUP_INTERACTION, displayName: '压弯强度', tooltip: '碰撞体对草片横向压弯的整体倍率。' })
    public interactionBendScale = 0.9;

    @property({ group: GROUP_INTERACTION, displayName: '最大弯曲距离', tooltip: '单根草允许被碰撞交互推离根部的最大距离。' })
    public maxBendDistance = 0.65;

    @property({ group: GROUP_INTERACTION, displayName: '交互刚度', tooltip: '草向目标弯曲状态靠近的速度，越高响应越硬。' })
    public interactionStiffness = 58;

    @property({ group: GROUP_INTERACTION, displayName: '交互阻尼', tooltip: '草弯曲速度的阻尼，越高越不容易来回抖动。' })
    public interactionDamping = 9.5;

    @property({ group: GROUP_INTERACTION, displayName: '默认恢复速度', tooltip: '没有交互体影响时草恢复直立的速度。' })
    public defaultRecoverySpeed = 4.5;

    @property({ group: GROUP_CRUSH, displayName: '启用压倒', tooltip: '开启后，碰撞体侵入较深时草会更激进地贴近地面。' })
    public crushEnabled = true;

    @property({ group: GROUP_CRUSH, displayName: '压倒阈值', tooltip: '交互强度超过该值后进入压倒状态。' })
    public crushThreshold = 0.45;

    @property({ group: GROUP_CRUSH, displayName: '压倒弯曲倍率', tooltip: '压倒状态额外增加的横向弯曲倍率。' })
    public crushBendScale = 1.2;

    @property({ group: GROUP_CRUSH, displayName: '压倒竖向比例', tooltip: '压倒时保留的竖向高度比例，越小越贴地。' })
    public crushVerticalScale = 0.1;

    @property({ group: GROUP_CRUSH, displayName: '压倒恢复倍率', tooltip: '压倒状态解除后的恢复速度倍率。' })
    public crushRecoveryMultiplier = 0.35;

    @property({ group: GROUP_CRUSH, displayName: '压倒进入速度', tooltip: '从普通弯曲进入压倒状态的速度。' })
    public crushEngageSpeed = 14;

    @property({ group: GROUP_REACTION, displayName: '启用反作用', tooltip: '开启后草地会向刚体或绳索采样器返回阻力/支撑力。' })
    public reactionEnabled = true;

    @property({ group: GROUP_REACTION, displayName: '反作用半径', tooltip: '采样草地反作用时影响周围草片的半径。' })
    public reactionRadius = 0.38;

    @property({ group: GROUP_REACTION, displayName: '抗弯能力', tooltip: '草抵抗被压弯的能力，用于和刚体重量或绳索重量配合。' })
    public bendResistance = 10;

    @property({ group: GROUP_REACTION, displayName: '阻力强度', tooltip: '草对运动物体产生的水平阻力强度。' })
    public reactionDrag = 3.2;

    @property({ group: GROUP_REACTION, displayName: '恢复推力', tooltip: '草恢复直立时反馈给交互物体的推力上限来源之一。' })
    public recoveryPush = 2.5;

    @property({ group: GROUP_REACTION, displayName: '密度力倍率', tooltip: '草密度对反作用力的影响倍率。' })
    public reactionDensityScale = 0.18;

    @property({ group: GROUP_REACTION, displayName: '最大反作用力', tooltip: '草地单次采样返回的最大力。' })
    public maxReactionForce = 36;

    @property({ group: GROUP_LOD, displayName: 'LOD 开始距离', tooltip: '超过该距离后开始按距离减少草片显示。' })
    public lodStartDistance = 8;

    @property({ group: GROUP_LOD, displayName: 'LOD 结束距离', tooltip: '超过该距离后低优先级草片会被隐藏。' })
    public lodEndDistance = 18;

    @property({ group: GROUP_LOD, displayName: '淡出开始距离', tooltip: '超过该距离后草片透明度开始降低。' })
    public fadeStartDistance = 14;

    @property({ group: GROUP_LOD, displayName: '淡出结束距离', tooltip: '超过该距离后草片完全淡出。' })
    public fadeEndDistance = 24;

    @property({ group: GROUP_RENDERING, displayName: '投射阴影', tooltip: '控制草渲染器是否投射阴影。' })
    public castShadow = false;

    @property({ group: GROUP_RENDERING, displayName: '接收阴影', tooltip: '控制草渲染器是否接收阴影。' })
    public receiveShadow = false;

    @property({ group: GROUP_PERFORMANCE, displayName: '网格更新间隔', tooltip: '交互弯曲数据上传到渲染网格的间隔。1/60 更流畅，1/30 更省性能。' })
    public meshUpdateInterval = 1 / 30;

    @property({ group: GROUP_PERFORMANCE, displayName: '空间网格尺寸', tooltip: '交互查询用的空间网格大小，通常略大于主要碰撞体半径。' })
    public spatialCellSize = 0.6;

    private readonly _triangles: TriangleSample[] = [];
    private readonly _blades: GrassBlade[] = [];
    private readonly _spatialGrid = new Map<string, GrassBlade[]>();
    private readonly _activeBlades = new Set<GrassBlade>();
    private readonly _frameTouchedBlades = new Set<GrassBlade>();
    private readonly _dirtyBladeIndices = new Set<number>();
    private readonly _densityPixels: Uint8Array[] = [];
    private _densityPixelsFlat: Uint8Array | null = null;
    private _manualDensityMap: Texture2D | null = null;
    private _densityWidth = 0;
    private _densityHeight = 0;
    private _meshRenderer: MeshRenderer | null = null;
    private _elapsed = 0;
    private _meshUpdateAccumulator = 0;
    private _needsMeshRebuild = true;
    private _renderMesh: Mesh | null = null;
    private _renderMeshIsDynamic = false;
    private _renderVertexCapacity = 0;
    private _renderIndexCapacity = 0;
    private _positions = new Float32Array(0);
    private _normals = new Float32Array(0);
    private _tangents = new Float32Array(0);
    private _uvs = new Float32Array(0);
    private _colors = new Float32Array(0);
    private _indices16: Uint16Array | null = null;
    private _indices32: Uint32Array | null = null;
    private readonly _meshMin = new Vec3();
    private readonly _meshMax = new Vec3();
    private _staticMeshDirty = true;
    private _interactionBufferDirty = true;

    onLoad() {
        this._meshRenderer = this.getComponent(MeshRenderer);
        this.applyRendererSettings();
    }

    onEnable() {
        GrassSurface._activeSurfaces.add(this);
    }

    onDisable() {
        GrassSurface._activeSurfaces.delete(this);
    }

    start() {
        if (this.rebuildOnStart && this._blades.length === 0) {
            this.rebuildGrass();
        }
    }

    update(dt: number) {
        this._elapsed += dt;
        if (this._blades.length === 0) {
            return;
        }

        this.updateInteractions(dt);
        this._meshUpdateAccumulator += dt;
        const shouldUploadMesh = this._needsMeshRebuild || this._interactionBufferDirty;
        if (shouldUploadMesh && (this.meshUpdateInterval <= 0 || this._meshUpdateAccumulator >= this.meshUpdateInterval)) {
            this._meshUpdateAccumulator = 0;
            this.rebuildRenderMesh();
        }
    }

    public rebuildGrass() {
        this._meshRenderer = this.getComponent(MeshRenderer);
        this.applyRendererSettings();
        this.readDensityMap();
        this.collectTriangles();
        this.scatterBlades();
        this._staticMeshDirty = true;
        this._needsMeshRebuild = true;
        this._meshUpdateAccumulator = 0;
        this.rebuildRenderMesh();
    }

    public setDensityPixelData(texture: Texture2D, pixels: Uint8Array, width: number, height: number) {
        this.densityMap = texture;
        this._manualDensityMap = texture;
        this._densityPixelsFlat = pixels;
        this._densityWidth = Math.max(1, width);
        this._densityHeight = Math.max(1, height);
    }

    public static sampleReactionFromSurfaces(
        root: Node | null,
        worldPosition: Readonly<Vec3>,
        worldVelocity: Readonly<Vec3>,
        radius: number,
        outForce: Vec3,
        options: GrassReactionOptions = {},
    ) {
        outForce.set(0, 0, 0);
        let density = 0;
        for (const surface of GrassSurface._activeSurfaces) {
            if (!surface.enabledInHierarchy || !surface.reactionEnabled || !surface.isUnderRoot(root)) {
                continue;
            }
            density += surface.sampleReaction(worldPosition, worldVelocity, radius, TMP_J, options);
            Vec3.add(outForce, outForce, TMP_J);
        }
        return density;
    }

    public sampleReaction(
        worldPosition: Readonly<Vec3>,
        worldVelocity: Readonly<Vec3>,
        radius: number,
        outForce: Vec3,
        options: GrassReactionOptions = {},
    ) {
        outForce.set(0, 0, 0);
        if (!this.reactionEnabled || this._blades.length === 0) {
            return 0;
        }

        this.node.getWorldMatrix(TMP_MAT_A);
        Mat4.invert(TMP_MAT_B, TMP_MAT_A);
        const localPosition = Vec3.transformMat4(TMP_A, worldPosition, TMP_MAT_B);
        const velocityEnd = Vec3.add(TMP_B, worldPosition, worldVelocity);
        Vec3.transformMat4(velocityEnd, velocityEnd, TMP_MAT_B);
        const localVelocity = Vec3.subtract(TMP_C, velocityEnd, localPosition);

        let density = 0;
        const localForce = TMP_D.set(0, 0, 0);
        const queryRadius = Math.max(0.02, radius);
        const supportScale = options.supportScale ?? 1;
        const dragScale = options.dragScale ?? 1;
        const recoveryScale = options.recoveryScale ?? 1;

        const searchRadius = queryRadius + Math.max(this.maxHeight, this.reactionRadius) + this.maxWidth * 4;
        this.forEachBladeNearLocal(localPosition, searchRadius, (blade) => {
            Vec3.subtract(TMP_E, localPosition, blade.root);
            const axial = Vec3.dot(TMP_E, blade.normal);
            if (axial < -queryRadius || axial > blade.height + queryRadius) {
                return;
            }

            Vec3.scaleAndAdd(TMP_F, TMP_E, blade.normal, -axial);
            const lateralDistance = TMP_F.length();
            const influenceRadius = Math.max(queryRadius + blade.width * 3, this.reactionRadius);
            if (lateralDistance > influenceRadius) {
                return;
            }

            const radialWeight = 1 - lateralDistance / influenceRadius;
            const heightWeight = clamp01((blade.height + queryRadius - axial) / Math.max(0.001, blade.height + queryRadius));
            const pressure = radialWeight * radialWeight * heightWeight;
            if (pressure <= 0.0001) {
                return;
            }

            density += pressure;

            Vec3.scaleAndAdd(TMP_G, localVelocity, blade.normal, -Vec3.dot(localVelocity, blade.normal));
            Vec3.multiplyScalar(TMP_G, TMP_G, -this.reactionDrag * dragScale * pressure);

            Vec3.multiplyScalar(TMP_H, blade.normal, this.bendResistance * supportScale * pressure);

            TMP_I.set(0, 0, 0);
            if (blade.bend.lengthSqr() > 0.000001) {
                Vec3.multiplyScalar(TMP_I, blade.bend, -this.recoveryPush * recoveryScale * pressure);
            }

            Vec3.add(localForce, localForce, TMP_G);
            Vec3.add(localForce, localForce, TMP_H);
            Vec3.add(localForce, localForce, TMP_I);
        });

        if (density <= 0) {
            return 0;
        }

        const densityScale = Math.max(0, options.densityScale ?? this.reactionDensityScale);
        const normalizedDensity = clamp01(density * densityScale);
        localForce.multiplyScalar(normalizedDensity / Math.max(0.001, density));

        const maxForce = Math.max(0, options.maxForce ?? this.maxReactionForce);
        const forceLength = localForce.length();
        if (maxForce > 0 && forceLength > maxForce) {
            localForce.multiplyScalar(maxForce / forceLength);
        }

        const localForceEnd = Vec3.add(TMP_E, localPosition, localForce);
        const worldStart = Vec3.transformMat4(TMP_F, localPosition, TMP_MAT_A);
        const worldEnd = Vec3.transformMat4(TMP_G, localForceEnd, TMP_MAT_A);
        Vec3.subtract(outForce, worldEnd, worldStart);
        return normalizedDensity;
    }

    private applyRendererSettings() {
        if (!this._meshRenderer) {
            return;
        }
        if (this.grassMaterial) {
            this._meshRenderer.setSharedMaterial(this.grassMaterial, 0);
        } else {
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
            this._meshRenderer.setSharedMaterial(material, 0);
        }
        this.updateGrassMaterialParams();
        this._meshRenderer.shadowCastingMode = this.castShadow ? 1 : 0;
        this._meshRenderer.receiveShadow = this.receiveShadow ? 1 : 0;
    }

    private updateGrassMaterialParams() {
        const material = this._meshRenderer ? this._meshRenderer.getSharedMaterial(0) : null;
        if (!material) {
            return;
        }

        material.setProperty('windParams', [
            this.windStrength,
            this.windScale,
            this.windSpeed,
            clamp01(this.interactionWindSuppression),
        ]);
        material.setProperty('bendParams', [
            clamp01(this.opposingWindSuppression),
            Math.max(0.001, this.maxBendDistance),
            0,
            0,
        ]);
    }

    private readDensityMap() {
        if (this.densityMap && this.densityMap === this._manualDensityMap && this._densityPixelsFlat) {
            return;
        }

        this._densityPixelsFlat = null;
        this._densityWidth = 0;
        this._densityHeight = 0;
        if (!this.densityMap) {
            return;
        }

        const image = this.densityMap.image as unknown as { data?: unknown } | null;
        const pixels = image && ArrayBuffer.isView(image.data) ? image.data as Uint8Array : null;
        if (pixels && pixels.length > 0) {
            this._densityPixelsFlat = pixels;
            this._densityWidth = Math.max(1, this.densityMap.width);
            this._densityHeight = Math.max(1, this.densityMap.height);
            return;
        }

        const canvasPixels = this.tryReadDensityMapWithCanvas();
        if (!canvasPixels || canvasPixels.length <= 0) {
            return;
        }

        this._densityPixelsFlat = canvasPixels;
        this._densityWidth = Math.max(1, this.densityMap.width);
        this._densityHeight = Math.max(1, this.densityMap.height);
    }

    private tryReadDensityMapWithCanvas() {
        if (!this.densityMap || typeof document === 'undefined') {
            return null;
        }

        const imageAsset = this.densityMap.image as unknown as {
            data?: unknown;
            _nativeAsset?: CanvasImageSource;
        } | null;
        const source = (imageAsset?._nativeAsset || imageAsset?.data) as CanvasImageSource | null;
        if (!source) {
            return null;
        }

        const width = Math.max(1, this.densityMap.width);
        const height = Math.max(1, this.densityMap.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        try {
            context.drawImage(source, 0, 0, width, height);
            return new Uint8Array(context.getImageData(0, 0, width, height).data);
        } catch (_error) {
            return null;
        }
    }

    private collectTriangles() {
        this._triangles.length = 0;

        const renderer = this.sourceRenderer || this.getComponent(MeshRenderer);
        const mesh = renderer ? renderer.mesh : null;
        if (!renderer || !mesh) {
            return;
        }

        const positions = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
        if (!positions) {
            return;
        }
        const normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
        const uvs = mesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD);
        const indices = mesh.readIndices(0);
        if (!indices) {
            return;
        }

        renderer.node.getWorldMatrix(TMP_MAT_A);
        this.node.getWorldMatrix(TMP_MAT_B);
        Mat4.invert(TMP_MAT_B, TMP_MAT_B);
        Mat4.multiply(TMP_MAT_A, TMP_MAT_B, TMP_MAT_A);

        let cumulative = 0;
        for (let i = 0; i < indices.length; i += 3) {
            const ia = indices[i];
            const ib = indices[i + 1];
            const ic = indices[i + 2];
            const a = this.readVec3(positions, ia, TMP_A);
            const b = this.readVec3(positions, ib, TMP_B);
            const c = this.readVec3(positions, ic, TMP_C);
            Vec3.transformMat4(a, a, TMP_MAT_A);
            Vec3.transformMat4(b, b, TMP_MAT_A);
            Vec3.transformMat4(c, c, TMP_MAT_A);

            Vec3.subtract(TMP_D, b, a);
            Vec3.subtract(TMP_E, c, a);
            Vec3.cross(TMP_F, TMP_D, TMP_E);
            const area = TMP_F.length() * 0.5;
            if (area <= 0.00001) {
                continue;
            }

            cumulative += area;
            const faceNormal = TMP_F.normalize().clone();
            this._triangles.push({
                a: a.clone(),
                b: b.clone(),
                c: c.clone(),
                na: normals ? this.readVec3(normals, ia, new Vec3()).normalize() : faceNormal.clone(),
                nb: normals ? this.readVec3(normals, ib, new Vec3()).normalize() : faceNormal.clone(),
                nc: normals ? this.readVec3(normals, ic, new Vec3()).normalize() : faceNormal.clone(),
                uva: uvs ? this.readVec2(uvs, ia) : new Vec2(0, 0),
                uvb: uvs ? this.readVec2(uvs, ib) : new Vec2(1, 0),
                uvc: uvs ? this.readVec2(uvs, ic) : new Vec2(0, 1),
                area,
                cumulativeArea: cumulative,
            });
        }
    }

    private scatterBlades() {
        this._blades.length = 0;
        this._activeBlades.clear();
        this._frameTouchedBlades.clear();
        this._dirtyBladeIndices.clear();
        this._interactionBufferDirty = true;
        if (this._triangles.length === 0) {
            return;
        }

        const totalArea = this._triangles[this._triangles.length - 1].cumulativeArea;
        const targetCount = Math.min(this.maxBlades, Math.floor(totalArea * Math.max(0, this.densityPerSquareMeter)));
        let attempts = 0;
        let seed = 17;
        while (this._blades.length < targetCount && attempts < targetCount * 8) {
            attempts++;
            seed += 11;
            const triangle = this.pickTriangle(hash01(seed) * totalArea);
            const r1 = Math.sqrt(hash01(seed + 1));
            const r2 = hash01(seed + 2);
            const wa = 1 - r1;
            const wb = r1 * (1 - r2);
            const wc = r1 * r2;
            const uv = new Vec2(
                triangle.uva.x * wa + triangle.uvb.x * wb + triangle.uvc.x * wc,
                triangle.uva.y * wa + triangle.uvb.y * wb + triangle.uvc.y * wc,
            );
            const density = this.sampleDensity(uv);
            if (hash01(seed + 3) > density) {
                continue;
            }

            const root = new Vec3(
                triangle.a.x * wa + triangle.b.x * wb + triangle.c.x * wc,
                triangle.a.y * wa + triangle.b.y * wb + triangle.c.y * wc,
                triangle.a.z * wa + triangle.b.z * wb + triangle.c.z * wc,
            );
            const normal = new Vec3(
                triangle.na.x * wa + triangle.nb.x * wb + triangle.nc.x * wc,
                triangle.na.y * wa + triangle.nb.y * wb + triangle.nc.y * wc,
                triangle.na.z * wa + triangle.nb.z * wb + triangle.nc.z * wc,
            ).normalize();
            const tangent = this.makeSurfaceTangent(normal, seed + 4);
            const bitangent = Vec3.cross(new Vec3(), normal, tangent).normalize();
            this._blades.push({
                index: this._blades.length,
                root,
                normal,
                tangent,
                bitangent,
                height: lerp(this.minHeight, this.maxHeight, hash01(seed + 5)),
                width: lerp(this.minWidth, this.maxWidth, hash01(seed + 6)),
                colorJitter: (hash01(seed + 7) * 2 - 1) * this.colorRandomness,
                seed,
                bend: new Vec3(),
                bendVelocity: new Vec3(),
                targetBend: new Vec3(),
                crush: 0,
                targetCrush: 0,
                interaction: 0,
                targetInteraction: 0,
                recovery: this.defaultRecoverySpeed,
                lod: hash01(seed + 8),
            });
        }

        this.buildSpatialGrid();
    }

    private buildSpatialGrid() {
        this._spatialGrid.clear();
        const cellSize = Math.max(0.05, this.spatialCellSize);
        for (const blade of this._blades) {
            const ix = Math.floor(blade.root.x / cellSize);
            const iz = Math.floor(blade.root.z / cellSize);
            const key = this.getSpatialKey(ix, iz);
            let cell = this._spatialGrid.get(key);
            if (!cell) {
                cell = [];
                this._spatialGrid.set(key, cell);
            }
            cell.push(blade);
        }
    }

    private getSpatialKey(ix: number, iz: number) {
        return `${ix}:${iz}`;
    }

    private forEachBladeNearWorld(worldCenter: Readonly<Vec3>, radius: number, callback: (blade: GrassBlade) => void) {
        this.node.getWorldMatrix(TMP_MAT_A);
        Mat4.invert(TMP_MAT_B, TMP_MAT_A);
        Vec3.transformMat4(TMP_L, worldCenter, TMP_MAT_B);
        this.forEachBladeNearLocal(TMP_L, radius, callback);
    }

    private forEachBladeNearLocal(localCenter: Readonly<Vec3>, radius: number, callback: (blade: GrassBlade) => void) {
        if (this._spatialGrid.size === 0) {
            for (const blade of this._blades) {
                callback(blade);
            }
            return;
        }

        const cellSize = Math.max(0.05, this.spatialCellSize);
        const range = Math.max(0, radius);
        const minX = Math.floor((localCenter.x - range) / cellSize);
        const maxX = Math.floor((localCenter.x + range) / cellSize);
        const minZ = Math.floor((localCenter.z - range) / cellSize);
        const maxZ = Math.floor((localCenter.z + range) / cellSize);
        const radiusSq = range * range;

        for (let ix = minX; ix <= maxX; ix++) {
            for (let iz = minZ; iz <= maxZ; iz++) {
                const cell = this._spatialGrid.get(this.getSpatialKey(ix, iz));
                if (!cell) {
                    continue;
                }

                for (const blade of cell) {
                    const dx = blade.root.x - localCenter.x;
                    const dz = blade.root.z - localCenter.z;
                    if (dx * dx + dz * dz <= radiusSq) {
                        callback(blade);
                    }
                }
            }
        }
    }

    private getInfluenceCenter(influence: GrassInfluence, out: Vec3) {
        if (influence.type === GrassInteractorShape.Capsule) {
            return Vec3.lerp(out, influence.start, influence.end, 0.5);
        }
        return out.set(influence.center);
    }

    private getInfluenceSearchRadius(influence: GrassInfluence) {
        const margin = Math.max(this.maxHeight, this.reactionRadius) + this.maxWidth * 4;
        if (influence.type === GrassInteractorShape.Sphere) {
            return influence.radius + margin;
        }
        if (influence.type === GrassInteractorShape.Capsule) {
            return Vec3.distance(influence.start, influence.end) * 0.5 + influence.radius + margin;
        }
        return Math.max(influence.halfExtents.x, influence.halfExtents.y, influence.halfExtents.z) + margin;
    }

    private updateInteractions(dt: number) {
        const influences = GrassInteractionManager.active ? GrassInteractionManager.active.getInfluences() : [];
        if (influences.length === 0 && this._activeBlades.size === 0) {
            return;
        }

        this._frameTouchedBlades.clear();
        for (const blade of this._activeBlades) {
            this.resetBladeTarget(blade);
        }

        this.node.getWorldMatrix(TMP_MAT_A);
        Mat4.invert(TMP_MAT_B, TMP_MAT_A);

        for (const influence of influences) {
            const center = this.getInfluenceCenter(influence, TMP_K);
            const radius = this.getInfluenceSearchRadius(influence);
            Vec3.transformMat4(TMP_L, center, TMP_MAT_B);
            this.forEachBladeNearLocal(TMP_L, radius, (blade) => {
                this.prepareInfluencedBlade(blade);
                this.applyInfluence(blade, influence);
            });
        }

        const inactive: GrassBlade[] = [];
        for (const blade of this._activeBlades) {
            this.finalizeBladeTarget(blade);
            this.integrateBladeBend(blade, dt);
            this.markBladeInteractionDirty(blade);
            if (this.isBladeAtRest(blade)) {
                this.resetBladeDynamics(blade);
                inactive.push(blade);
            }
        }

        for (const blade of inactive) {
            this._activeBlades.delete(blade);
        }
    }

    private prepareInfluencedBlade(blade: GrassBlade) {
        if (!this._frameTouchedBlades.has(blade)) {
            this._frameTouchedBlades.add(blade);
            this.resetBladeTarget(blade);
        }
        this._activeBlades.add(blade);
    }

    private resetBladeTarget(blade: GrassBlade) {
        blade.targetBend.set(0, 0, 0);
        blade.targetCrush = 0;
        blade.targetInteraction = 0;
        blade.recovery = this.defaultRecoverySpeed;
    }

    private resetBladeDynamics(blade: GrassBlade) {
        blade.bend.set(0, 0, 0);
        blade.bendVelocity.set(0, 0, 0);
        blade.crush = 0;
        blade.interaction = 0;
        this.resetBladeTarget(blade);
        this.markBladeInteractionDirty(blade);
    }

    private isBladeAtRest(blade: GrassBlade) {
        return blade.targetBend.lengthSqr() <= 0.000001
            && blade.bend.lengthSqr() <= 0.000001
            && blade.bendVelocity.lengthSqr() <= 0.000001
            && blade.targetCrush <= 0.001
            && blade.crush <= 0.001
            && blade.targetInteraction <= 0.001
            && blade.interaction <= 0.001;
    }

    private markBladeInteractionDirty(blade: GrassBlade) {
        this._dirtyBladeIndices.add(blade.index);
        this._interactionBufferDirty = true;
    }

    private applyInfluence(blade: GrassBlade, influence: GrassInfluence) {
        if (influence.type === GrassInteractorShape.Sphere) {
            const tip = Vec3.scaleAndAdd(TMP_C, blade.root, blade.normal, blade.height);
            const closest = this.closestPointOnSegment(influence.center, blade.root, tip, TMP_D);
            const toBlade = Vec3.subtract(TMP_A, closest, influence.center);
            const distance = toBlade.length();
            const penetration = influence.radius - distance;
            if (penetration <= 0) {
                return;
            }
            const direction = distance > 0.0001 ? Vec3.multiplyScalar(TMP_B, toBlade, 1 / distance) : blade.tangent;
            const heightT = this.bladeHeightT(blade, closest);
            this.pushBlade(blade, direction, penetration / influence.radius, influence.strength, influence.recovery, heightT, false);
            return;
        }

        if (influence.type === GrassInteractorShape.Capsule) {
            const tip = Vec3.scaleAndAdd(TMP_C, blade.root, blade.normal, blade.height);
            this.closestPointsBetweenSegments(blade.root, tip, influence.start, influence.end, TMP_A, TMP_B);
            const toBlade = Vec3.subtract(TMP_C, TMP_A, TMP_B);
            const distance = toBlade.length();
            const penetration = influence.radius - distance;
            if (penetration <= 0) {
                return;
            }
            const direction = distance > 0.0001 ? Vec3.multiplyScalar(TMP_D, toBlade, 1 / distance) : blade.tangent;
            const heightT = this.bladeHeightT(blade, TMP_A);
            this.pushBlade(blade, direction, penetration / influence.radius, influence.strength, influence.recovery, heightT, false);
            return;
        }

        const boxPoint = this.findDeepestBoxContactPoint(blade, influence, TMP_F);
        if (!boxPoint) {
            return;
        }

        Vec3.subtract(TMP_A, boxPoint, influence.center);
        const lx = Vec3.dot(TMP_A, influence.axisX);
        const ly = Vec3.dot(TMP_A, influence.axisY);
        const lz = Vec3.dot(TMP_A, influence.axisZ);
        const dx = influence.halfExtents.x - Math.abs(lx);
        const dy = influence.halfExtents.y - Math.abs(ly);
        const dz = influence.halfExtents.z - Math.abs(lz);
        const penetration = Math.min(dx, dy, dz);
        if (penetration <= 0) {
            return;
        }

        const axis = dx <= dy && dx <= dz ? influence.axisX : (dy <= dz ? influence.axisY : influence.axisZ);
        const sign = dx <= dy && dx <= dz ? Math.sign(lx || 1) : (dy <= dz ? Math.sign(ly || 1) : Math.sign(lz || 1));
        const direction = Vec3.multiplyScalar(TMP_B, axis, sign);
        const effectiveRadius = Math.max(0.001, Math.min(influence.halfExtents.x, influence.halfExtents.y, influence.halfExtents.z));
        const heightT = this.bladeHeightT(blade, boxPoint);
        this.pushBlade(blade, direction, penetration / effectiveRadius, influence.strength, influence.recovery, heightT, true);
    }

    private pushBlade(blade: GrassBlade, direction: Vec3, penetration01: number, strength: number, recovery: number, heightT: number, preferCrush: boolean) {
        const tangentDirection = this.projectToSurface(direction, blade.normal, TMP_C);
        const leverage = lerp(0.35, 1, clamp01(heightT));
        const pressure = Math.pow(clamp01(penetration01), 0.65);
        const crush = this.computeCrush(pressure, heightT, preferCrush);
        const bendScale = this.interactionBendScale + crush * this.crushBendScale * blade.height;
        Vec3.scaleAndAdd(TMP_D, blade.targetBend, tangentDirection, pressure * bendScale * strength * leverage);
        blade.targetBend.set(TMP_D);
        blade.targetCrush = this.saturatingAdd01(blade.targetCrush, crush);
        blade.targetInteraction = this.saturatingAdd01(blade.targetInteraction, pressure);
        blade.recovery = Math.max(0.01, Math.min(blade.recovery, recovery));
    }

    private finalizeBladeTarget(blade: GrassBlade) {
        const length = blade.targetBend.length();
        if (length > this.maxBendDistance) {
            blade.targetBend.multiplyScalar(this.maxBendDistance / length);
        }
        blade.targetCrush = clamp01(blade.targetCrush);
        blade.targetInteraction = clamp01(blade.targetInteraction);
    }

    private saturatingAdd01(a: number, b: number) {
        return 1 - (1 - clamp01(a)) * (1 - clamp01(b));
    }

    private integrateBladeBend(blade: GrassBlade, dt: number) {
        const responseScale = Math.max(0.2, blade.recovery / Math.max(0.001, this.defaultRecoverySpeed));
        Vec3.subtract(TMP_A, blade.targetBend, blade.bend);
        Vec3.scaleAndAdd(blade.bendVelocity, blade.bendVelocity, TMP_A, Math.max(0.01, this.interactionStiffness) * responseScale * dt);
        blade.bendVelocity.multiplyScalar(Math.exp(-Math.max(0, this.interactionDamping) * dt));
        Vec3.scaleAndAdd(blade.bend, blade.bend, blade.bendVelocity, dt);

        const crushSpeed = blade.targetCrush > blade.crush
            ? this.crushEngageSpeed
            : blade.recovery * this.crushRecoveryMultiplier;
        blade.crush = lerp(blade.crush, blade.targetCrush, clamp01(dt * Math.max(0.01, crushSpeed)));
        blade.interaction = lerp(
            blade.interaction,
            blade.targetInteraction,
            clamp01(dt * Math.max(0.01, blade.targetInteraction > blade.interaction ? this.crushEngageSpeed : blade.recovery)),
        );

        const bendLength = blade.bend.length();
        if (bendLength > this.maxBendDistance) {
            blade.bend.multiplyScalar(this.maxBendDistance / bendLength);
            const outwardSpeed = Vec3.dot(blade.bendVelocity, blade.bend);
            if (outwardSpeed > 0) {
                Vec3.scaleAndAdd(blade.bendVelocity, blade.bendVelocity, blade.bend, -outwardSpeed / Math.max(0.001, blade.bend.lengthSqr()));
            }
        }
    }

    private computeCrush(pressure: number, heightT: number, preferCrush: boolean) {
        if (!this.crushEnabled) {
            return 0;
        }
        const threshold = clamp01(this.crushThreshold - (preferCrush ? 0.18 : 0));
        const depthCrush = clamp01((pressure - threshold) / Math.max(0.001, 1 - threshold));
        const heightCrush = clamp01((heightT - 0.15) / 0.85);
        const shapeBoost = preferCrush ? 1.25 : 1;
        return clamp01(depthCrush * lerp(0.45, 1, heightCrush) * shapeBoost);
    }

    private projectToSurface(direction: Vec3, normal: Vec3, out: Vec3) {
        Vec3.scaleAndAdd(out, direction, normal, -Vec3.dot(direction, normal));
        if (out.lengthSqr() <= 0.000001) {
            out.set(this.makeSurfaceTangent(normal, 13));
            Vec3.scaleAndAdd(out, out, normal, -Vec3.dot(out, normal));
        }
        return out.normalize();
    }

    private bladeHeightT(blade: GrassBlade, point: Vec3) {
        Vec3.subtract(TMP_E, point, blade.root);
        return clamp01(Vec3.dot(TMP_E, blade.normal) / Math.max(0.001, blade.height));
    }

    private findDeepestBoxContactPoint(blade: GrassBlade, influence: GrassInfluence, out: Vec3) {
        if (influence.type !== GrassInteractorShape.Box) {
            return null;
        }

        let bestPenetration = -1;
        let bestT = 0;
        for (let i = 0; i <= 4; i++) {
            const t = i / 4;
            const point = Vec3.scaleAndAdd(TMP_C, blade.root, blade.normal, blade.height * t);
            Vec3.subtract(TMP_A, point, influence.center);
            const dx = influence.halfExtents.x - Math.abs(Vec3.dot(TMP_A, influence.axisX));
            const dy = influence.halfExtents.y - Math.abs(Vec3.dot(TMP_A, influence.axisY));
            const dz = influence.halfExtents.z - Math.abs(Vec3.dot(TMP_A, influence.axisZ));
            const penetration = Math.min(dx, dy, dz);
            if (penetration > bestPenetration) {
                bestPenetration = penetration;
                bestT = t;
            }
        }

        if (bestPenetration <= 0) {
            return null;
        }

        return Vec3.scaleAndAdd(out, blade.root, blade.normal, blade.height * bestT);
    }

    private rebuildRenderMesh() {
        if (!this._meshRenderer) {
            this._meshRenderer = this.getComponent(MeshRenderer);
        }
        if (!this._meshRenderer) {
            return;
        }

        const segments = Math.max(1, Math.floor(this.bladeSegments));
        const bladeCount = this._blades.length;
        const verticesPerBlade = (segments + 1) * 2;
        const vertexCount = bladeCount * verticesPerBlade;
        const indexCount = bladeCount * segments * 6;
        if (vertexCount <= 0 || indexCount <= 0) {
            this._meshRenderer.mesh = null;
            this._needsMeshRebuild = false;
            return;
        }

        this.ensureRenderBuffers(vertexCount, indexCount, segments);
        let localCameraPos: Vec3 | null = null;
        if (this.lodCamera) {
            this.node.getWorldMatrix(TMP_MAT_A);
            Mat4.invert(TMP_MAT_B, TMP_MAT_A);
            localCameraPos = Vec3.transformMat4(TMP_K, this.lodCamera.node.worldPosition, TMP_MAT_B);
        }

        if (this._staticMeshDirty || !this._renderMesh) {
            this.writeStaticRenderData(segments, localCameraPos);
        }

        this.writeInteractionData(segments, localCameraPos);
        this.submitRenderMesh(vertexCount, indexCount);
        this._needsMeshRebuild = false;
    }

    private writeStaticRenderData(segments: number, localCameraPos: Vec3 | null) {
        const verticesPerBlade = (segments + 1) * 2;
        this._meshMin.set(Infinity, Infinity, Infinity);
        this._meshMax.set(-Infinity, -Infinity, -Infinity);

        for (let bladeIndex = 0; bladeIndex < this._blades.length; bladeIndex++) {
            const blade = this._blades[bladeIndex];
            const fade = this.computeDistanceFade(blade, localCameraPos);
            const visibilityScale = 1;
            const bladeVertexOffset = bladeIndex * verticesPerBlade;

            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const originalDistance = blade.height * t * visibilityScale;
                const center = Vec3.scaleAndAdd(TMP_C, blade.root, blade.normal, originalDistance);
                const width = blade.width * (1 - t * 0.82) * visibilityScale;
                Vec3.scaleAndAdd(TMP_D, center, blade.bitangent, -width);
                Vec3.scaleAndAdd(TMP_E, center, blade.bitangent, width);

                const leftVertex = bladeVertexOffset + i * 2;
                const rightVertex = leftVertex + 1;
                this.writePosition(leftVertex, TMP_D);
                this.writePosition(rightVertex, TMP_E);
                this.writeBend(leftVertex, Vec3.ZERO);
                this.writeBend(rightVertex, Vec3.ZERO);
                this.writeRoot(leftVertex, blade.root);
                this.writeRoot(rightVertex, blade.root);
                this.writeUv(leftVertex, 0, t);
                this.writeUv(rightVertex, 1, t);
                this.writeColor(leftVertex, t, blade.colorJitter, fade);
                this.writeColor(rightVertex, t, blade.colorJitter, fade);
            }
        }

        this._staticMeshDirty = false;
    }

    private writeInteractionData(segments: number, localCameraPos: Vec3 | null) {
        const verticesPerBlade = (segments + 1) * 2;
        for (const bladeIndex of this._dirtyBladeIndices) {
            const blade = this._blades[bladeIndex];
            if (!blade) {
                continue;
            }
            const visibilityScale = 1;
            const bladeVertexOffset = bladeIndex * verticesPerBlade;
            const bendX = blade.bend.x * visibilityScale;
            const bendY = blade.bend.y * visibilityScale;
            const bendZ = blade.bend.z * visibilityScale;
            for (let i = 0; i <= segments; i++) {
                const leftVertex = bladeVertexOffset + i * 2;
                const rightVertex = leftVertex + 1;
                let offset = leftVertex * 3;
                this._normals[offset] = bendX;
                this._normals[offset + 1] = bendY;
                this._normals[offset + 2] = bendZ;
                offset = rightVertex * 3;
                this._normals[offset] = bendX;
                this._normals[offset + 1] = bendY;
                this._normals[offset + 2] = bendZ;
            }
        }
        this._dirtyBladeIndices.clear();
    }

    private ensureRenderBuffers(vertexCount: number, indexCount: number, segments: number) {
        const topologyChanged = vertexCount !== this._renderVertexCapacity || indexCount !== this._renderIndexCapacity;
        if (!topologyChanged) {
            return;
        }

        this._renderVertexCapacity = vertexCount;
        this._renderIndexCapacity = indexCount;
        this._positions = new Float32Array(vertexCount * 3);
        this._normals = new Float32Array(vertexCount * 3);
        this._tangents = new Float32Array(vertexCount * 4);
        this._uvs = new Float32Array(vertexCount * 2);
        this._colors = new Float32Array(vertexCount * 4);
        this._indices16 = vertexCount <= 65535 ? new Uint16Array(indexCount) : null;
        this._indices32 = vertexCount > 65535 ? new Uint32Array(indexCount) : null;
        this.fillFixedIndices(segments);
        this._renderMesh = null;
        this._renderMeshIsDynamic = false;
        this._staticMeshDirty = true;
    }

    private fillFixedIndices(segments: number) {
        const verticesPerBlade = (segments + 1) * 2;
        let offset = 0;
        const indices = this._indices16 || this._indices32;
        if (!indices) {
            return;
        }

        for (let bladeIndex = 0; bladeIndex < this._blades.length; bladeIndex++) {
            const vertexBase = bladeIndex * verticesPerBlade;
            for (let i = 0; i < segments; i++) {
                const row = vertexBase + i * 2;
                indices[offset++] = row;
                indices[offset++] = row + 1;
                indices[offset++] = row + 2;
                indices[offset++] = row + 1;
                indices[offset++] = row + 3;
                indices[offset++] = row + 2;
            }
        }
    }

    private writePosition(vertex: number, value: Readonly<Vec3>) {
        const offset = vertex * 3;
        this._positions[offset] = value.x;
        this._positions[offset + 1] = value.y;
        this._positions[offset + 2] = value.z;
        this._meshMin.x = Math.min(this._meshMin.x, value.x);
        this._meshMin.y = Math.min(this._meshMin.y, value.y);
        this._meshMin.z = Math.min(this._meshMin.z, value.z);
        this._meshMax.x = Math.max(this._meshMax.x, value.x);
        this._meshMax.y = Math.max(this._meshMax.y, value.y);
        this._meshMax.z = Math.max(this._meshMax.z, value.z);
    }

    private writeBend(vertex: number, value: Readonly<Vec3>) {
        const offset = vertex * 3;
        this._normals[offset] = value.x;
        this._normals[offset + 1] = value.y;
        this._normals[offset + 2] = value.z;
    }

    private writeRoot(vertex: number, value: Readonly<Vec3>) {
        const offset = vertex * 4;
        this._tangents[offset] = value.x;
        this._tangents[offset + 1] = value.y;
        this._tangents[offset + 2] = value.z;
        this._tangents[offset + 3] = 1;
    }

    private writeUv(vertex: number, u: number, v: number) {
        const offset = vertex * 2;
        this._uvs[offset] = u;
        this._uvs[offset + 1] = v;
    }

    private writeColor(vertex: number, t: number, jitter: number, alpha: number) {
        const r = lerp(this.rootColor.r / 255, this.tipColor.r / 255, t);
        const g = lerp(this.rootColor.g / 255, this.tipColor.g / 255, t);
        const b = lerp(this.rootColor.b / 255, this.tipColor.b / 255, t);
        const scale = 1 + jitter;
        const offset = vertex * 4;
        this._colors[offset] = clamp01(r * scale);
        this._colors[offset + 1] = clamp01(g * scale);
        this._colors[offset + 2] = clamp01(b * scale);
        this._colors[offset + 3] = clamp01(alpha);
    }

    private submitRenderMesh(vertexCount: number, indexCount: number) {
        if (this._renderMesh && this._renderMeshIsDynamic) {
            this.updateInteractionVertexBuffer();
            return;
        }

        const geometry = {
            positions: this._positions,
            normals: this._normals,
            tangents: this._tangents,
            uvs: this._uvs,
            colors: this._colors,
            indices16: this._indices16 || undefined,
            indices32: this._indices32 || undefined,
            primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST,
            minPos: this._meshMin,
            maxPos: this._meshMax,
        };
        const meshUtils = utils as unknown as {
            createDynamicMesh?: (primitiveIndex: number, dynamicGeometry: typeof geometry, out?: Mesh, options?: { maxSubMeshes: number; maxSubMeshVertices: number; maxSubMeshIndices: number }) => Mesh;
            createMesh: (geometry: { positions: number[]; normals: number[]; tangents: number[]; uvs: number[]; colors: number[]; indices: number[] }, out?: Mesh, options?: { calculateBounds?: boolean }) => Mesh;
        };

        if (meshUtils.createDynamicMesh) {
            if (!this._renderMesh || !this._renderMeshIsDynamic) {
                this._renderMesh = meshUtils.createDynamicMesh(0, geometry, this._renderMesh || undefined, {
                    maxSubMeshes: 1,
                    maxSubMeshVertices: vertexCount,
                    maxSubMeshIndices: indexCount,
                });
                this._meshRenderer!.mesh = this._renderMesh;
                this._renderMeshIsDynamic = true;
            }
            return;
        }

        this._renderMesh = meshUtils.createMesh({
            positions: Array.from(this._positions),
            normals: Array.from(this._normals),
            tangents: Array.from(this._tangents),
            uvs: Array.from(this._uvs),
            colors: Array.from(this._colors),
            indices: Array.from(this._indices16 || this._indices32 || []),
        }, this._renderMesh || undefined, { calculateBounds: false });
        this._meshRenderer!.mesh = this._renderMesh;
        this._renderMeshIsDynamic = false;
    }

    private updateInteractionVertexBuffer() {
        if (!this._renderMesh) {
            return;
        }

        if (this.updateBendVertexBufferOnly()) {
            this._interactionBufferDirty = false;
            return;
        }

        this._renderMesh.updateSubMesh(0, {
            positions: this._positions,
            normals: this._normals,
            tangents: this._tangents,
            uvs: this._uvs,
            colors: this._colors,
            indices16: this._indices16 || undefined,
            indices32: this._indices32 || undefined,
            primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST,
            minPos: this._meshMin,
            maxPos: this._meshMax,
        });
        this._interactionBufferDirty = false;
    }

    private updateBendVertexBufferOnly() {
        const subMeshes = (this._renderMesh as unknown as {
            renderingSubMeshes?: Array<{ vertexBuffers?: Array<{ update?: (data: Uint8Array, size?: number) => void }> }>;
        }).renderingSubMeshes;
        const normalBuffer = subMeshes?.[0]?.vertexBuffers?.[1];
        if (!normalBuffer || typeof normalBuffer.update !== 'function') {
            return false;
        }

        const data = new Uint8Array(this._normals.buffer, this._normals.byteOffset, this._normals.byteLength);
        normalBuffer.update(data, data.byteLength);
        return true;
    }

    private computeDistanceFade(blade: GrassBlade, localCameraPos: Readonly<Vec3> | null) {
        if (!localCameraPos) {
            return 1;
        }
        const distance = Vec3.distance(blade.root, localCameraPos);
        const lodFade = 1 - clamp01((distance - this.lodStartDistance) / Math.max(0.001, this.lodEndDistance - this.lodStartDistance));
        const alphaFade = 1 - clamp01((distance - this.fadeStartDistance) / Math.max(0.001, this.fadeEndDistance - this.fadeStartDistance));
        const fade = Math.min(lodFade, alphaFade);
        return blade.lod > fade ? 0 : fade;
    }

    private pushColor(out: number[], t: number, jitter: number, alpha: number) {
        const r = lerp(this.rootColor.r / 255, this.tipColor.r / 255, t);
        const g = lerp(this.rootColor.g / 255, this.tipColor.g / 255, t);
        const b = lerp(this.rootColor.b / 255, this.tipColor.b / 255, t);
        const scale = 1 + jitter;
        out.push(clamp01(r * scale), clamp01(g * scale), clamp01(b * scale), clamp01(alpha));
    }

    private sampleDensity(uv: Vec2) {
        if (!this._densityPixelsFlat || this._densityWidth <= 0 || this._densityHeight <= 0) {
            return 1;
        }

        const u = ((uv.x % 1) + 1) % 1;
        const v = ((uv.y % 1) + 1) % 1;
        const x = Math.min(this._densityWidth - 1, Math.floor(u * this._densityWidth));
        const y = Math.min(this._densityHeight - 1, Math.floor((1 - v) * this._densityHeight));
        const index = (y * this._densityWidth + x) * 4;
        const r = this._densityPixelsFlat[index] || 0;
        const g = this._densityPixelsFlat[index + 1] || 0;
        const b = this._densityPixelsFlat[index + 2] || 0;
        return (r + g + b) / (255 * 3);
    }

    private pickTriangle(areaMark: number) {
        let low = 0;
        let high = this._triangles.length - 1;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (this._triangles[mid].cumulativeArea < areaMark) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return this._triangles[low];
    }

    private readVec3(data: ArrayLike<number>, index: number, out: Vec3) {
        const base = index * 3;
        out.set(data[base], data[base + 1], data[base + 2]);
        return out;
    }

    private readVec2(data: ArrayLike<number>, index: number) {
        const base = index * 2;
        return new Vec2(data[base], data[base + 1]);
    }

    private makeSurfaceTangent(normal: Vec3, seed: number) {
        const base = Math.abs(Vec3.dot(normal, Vec3.UP)) > 0.9 ? Vec3.RIGHT : Vec3.UP;
        const tangent = Vec3.cross(new Vec3(), normal, base).normalize();
        const bitangent = Vec3.cross(new Vec3(), normal, tangent).normalize();
        const angle = hash01(seed) * Math.PI * 2;
        return new Vec3(
            tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle),
            tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle),
            tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle),
        ).normalize();
    }

    private closestPointOnSegment(point: Vec3, a: Vec3, b: Vec3, out: Vec3) {
        Vec3.subtract(TMP_E, b, a);
        const lengthSq = TMP_E.lengthSqr();
        if (lengthSq <= 0.000001) {
            return out.set(a);
        }
        const t = clamp01(Vec3.dot(Vec3.subtract(TMP_F, point, a), TMP_E) / lengthSq);
        return Vec3.scaleAndAdd(out, a, TMP_E, t);
    }

    private closestPointsBetweenSegments(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, outA: Vec3, outB: Vec3) {
        const d1 = Vec3.subtract(new Vec3(), a1, a0);
        const d2 = Vec3.subtract(new Vec3(), b1, b0);
        const r = Vec3.subtract(new Vec3(), a0, b0);
        const a = Vec3.dot(d1, d1);
        const e = Vec3.dot(d2, d2);
        const f = Vec3.dot(d2, r);
        let s = 0;
        let t = 0;

        if (a <= 0.000001 && e <= 0.000001) {
            outA.set(a0);
            outB.set(b0);
            return;
        }

        if (a <= 0.000001) {
            t = clamp01(f / e);
        } else {
            const c = Vec3.dot(d1, r);
            if (e <= 0.000001) {
                s = clamp01(-c / a);
            } else {
                const b = Vec3.dot(d1, d2);
                const denom = a * e - b * b;
                if (denom !== 0) {
                    s = clamp01((b * f - c * e) / denom);
                }
                t = (b * s + f) / e;
                if (t < 0) {
                    t = 0;
                    s = clamp01(-c / a);
                } else if (t > 1) {
                    t = 1;
                    s = clamp01((b - c) / a);
                }
            }
        }

        Vec3.scaleAndAdd(outA, a0, d1, s);
        Vec3.scaleAndAdd(outB, b0, d2, t);
    }

    private isUnderRoot(root: Node | null) {
        if (!root) {
            return true;
        }

        let current: Node | null = this.node;
        while (current) {
            if (current === root) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }
}
