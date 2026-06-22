'use strict';

function findNodeByUuid(root, uuid) {
    if (!root || !uuid) {
        return null;
    }
    if (root.uuid === uuid || root._uuid === uuid) {
        return root;
    }
    for (const child of root.children || []) {
        const result = findNodeByUuid(child, uuid);
        if (result) {
            return result;
        }
    }
    return null;
}

function getProjectClass(modulePath, className) {
    try {
        const moduleExports = require(modulePath);
        return moduleExports[className] || moduleExports.default || null;
    } catch (error) {
        return null;
    }
}

function addComponentSafe(node, componentCtor, componentName) {
    if (componentCtor) {
        try {
            return node.addComponent(componentCtor);
        } catch (error) {
            // Fall back to component name below.
        }
    }
    try {
        return node.addComponent(componentName);
    } catch (error) {
        return null;
    }
}

function getComponentSafe(node, componentCtor, componentName) {
    if (componentCtor) {
        try {
            return node.getComponent(componentCtor);
        } catch (error) {
            // Fall back to component name below.
        }
    }
    try {
        return node.getComponent(componentName);
    } catch (error) {
        return null;
    }
}

function loadAssetByUuid(uuid) {
    if (!uuid) {
        return Promise.resolve(null);
    }
    const { assetManager } = require('cc');
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (error, asset) => {
            resolve(error ? null : asset);
        });
    });
}

function setRendererMaterial(renderer, material) {
    if (!renderer || !material) {
        return;
    }
    if (typeof renderer.setSharedMaterial === 'function') {
        renderer.setSharedMaterial(material, 0);
        return;
    }
    if (typeof renderer.setMaterial === 'function') {
        renderer.setMaterial(material, 0);
        return;
    }
    renderer.material = material;
}

function createSourceMesh() {
    const { Vec3, utils, gfx } = require('cc');
    const halfWidth = 4;
    const halfLength = 3;
    return utils.createMesh({
        positions: [
            -halfWidth, 0, -halfLength,
            halfWidth, 0, -halfLength,
            -halfWidth, 0, halfLength,
            halfWidth, 0, halfLength,
        ],
        normals: [
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
        ],
        uvs: [
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ],
        indices: [0, 1, 2, 1, 3, 2],
        primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST,
        minPos: new Vec3(-halfWidth, 0, -halfLength),
        maxPos: new Vec3(halfWidth, 0, halfLength),
    });
}

exports.methods = {
    async createGrass3DNodeV2(parentUuid, assetRefs = {}) {
        const {
            BoxCollider,
            director,
            MeshRenderer,
            Node,
            Vec3,
        } = require('cc');
        const GrassSurface = getProjectClass('db://assets/GrassSystem/scripts/GrassSurface', 'GrassSurface');
        const GrassInteractionManager = getProjectClass('db://assets/GrassSystem/scripts/GrassInteractionManager', 'GrassInteractionManager');

        const scene = director.getScene();
        if (!scene) {
            return {
                success: false,
                message: '当前没有打开的场景。',
            };
        }

        const parent = findNodeByUuid(scene, parentUuid) || scene;
        const rootNode = new Node('Grass3D');
        const managerNode = new Node('InteractionManager');
        const sourceNode = new Node('GrassSource_Mesh');
        const grassNode = new Node('GrassSurface_BatchedBlades');

        parent.addChild(rootNode);
        rootNode.addChild(managerNode);
        rootNode.addChild(sourceNode);
        rootNode.addChild(grassNode);

        rootNode.setPosition(new Vec3(0, 0, 0));
        managerNode.setPosition(new Vec3(0, 0, 0));
        sourceNode.setPosition(new Vec3(0, 0, 0));
        grassNode.setPosition(new Vec3(0, 0, 0));

        const sourceRenderer = addComponentSafe(sourceNode, MeshRenderer, 'cc.MeshRenderer');
        const sourceCollider = addComponentSafe(sourceNode, BoxCollider, 'cc.BoxCollider');
        if (sourceRenderer) {
            sourceRenderer.mesh = createSourceMesh();
        }
        if (sourceCollider) {
            sourceCollider.size = new Vec3(8, 0.04, 6);
            sourceCollider.center = new Vec3(0, -0.02, 0);
        }

        addComponentSafe(managerNode, GrassInteractionManager, 'GrassInteractionManager');

        const grassRenderer = addComponentSafe(grassNode, MeshRenderer, 'cc.MeshRenderer');
        const grassSurface = getComponentSafe(grassNode, GrassSurface, 'GrassSurface') || addComponentSafe(grassNode, GrassSurface, 'GrassSurface');

        if (!sourceRenderer || !grassRenderer || !grassSurface) {
            rootNode.destroy();
            return {
                success: false,
                message: '3d草地组件创建失败，请确认 assets/GrassSystem 运行时代码已经完成导入。',
            };
        }

        const [grassMaterial, groundMaterial, densityTexture] = await Promise.all([
            loadAssetByUuid(assetRefs.grassMaterialUuid),
            loadAssetByUuid(assetRefs.groundMaterialUuid),
            loadAssetByUuid(assetRefs.densityTextureUuid),
        ]);

        setRendererMaterial(sourceRenderer, groundMaterial);
        setRendererMaterial(grassRenderer, grassMaterial);

        grassSurface.sourceRenderer = sourceRenderer;
        grassSurface.grassMaterial = grassMaterial;
        grassSurface.densityMap = densityTexture;
        grassSurface.rebuildOnStart = true;
        grassSurface.densityPerSquareMeter = 55;
        grassSurface.maxBlades = 5000;
        grassSurface.castShadow = true;
        grassSurface.receiveShadow = true;

        if (typeof grassSurface.rebuildGrass === 'function') {
            grassSurface.rebuildGrass();
        }

        return {
            success: true,
            uuid: rootNode.uuid || rootNode._uuid,
            name: rootNode.name,
            message: '已创建 3d草地节点。',
        };
    },
};
