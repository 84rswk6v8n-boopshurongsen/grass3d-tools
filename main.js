'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'grass3d-tools';
const GRASS_MENU_LABEL = '3d草地';
const RUNTIME_ASSET_URL = 'db://assets/GrassSystem';
const RUNTIME_SOURCE_DIR = path.join(__dirname, 'runtime-template', 'assets', 'GrassSystem');
const CREATE_LABELS = new Set(['创建', 'Create']);
const OBJECT_3D_LABELS = new Set(['3D 对象', '3D Object']);
const BUILTIN_3D_OBJECT_LABELS = [
    'Capsule', 'Cone', 'Cube', 'Cylinder', 'Plane', 'Quad', 'Sphere', 'Torus',
    '胶囊', '圆锥体', '立方体', '圆柱体', '平面', '四方形', '球体', '圆环体',
];
const REQUIRED_RUNTIME_FILES = [
    'scripts/GrassSurface.ts',
    'scripts/GrassInteractionManager.ts',
    'scripts/GrassInteractor.ts',
    'scripts/GrassRopeInteractor.ts',
    'scripts/GrassRigidbodyReaction.ts',
    'scripts/GrassTypes.ts',
    'shaders/GrassBladeGPU.effect',
    'materials/GrassBlade_Demo.mtl',
    'materials/GrassGround_Demo.mtl',
    'textures/GrassDensity_Demo.png',
    'README.md',
];

let originalMenuPopup = null;
let runtimeInstallPromise = null;

function getSelectedNodeUuid() {
    try {
        const selected = Editor.Selection.getSelected('node');
        return selected && selected.length > 0 ? selected[0] : '';
    } catch (error) {
        return '';
    }
}

exports.load = function load() {
    console.log('[grass3d-tools] loaded');
    patchHierarchyContextMenu();
    ensureRuntimeAssets().catch((error) => {
        console.warn('[grass3d-tools] runtime install check failed:', error);
    });
};

exports.unload = function unload() {
    if (originalMenuPopup && Editor.Menu && Editor.Menu.popup.__grass3dOriginalPopup === originalMenuPopup) {
        Editor.Menu.popup = originalMenuPopup;
    }
    originalMenuPopup = null;
};

exports.methods = {
    async createGrass3DNode(parentUuidFromMenu = '') {
        const runtime = await ensureRuntimeAssets();
        if (!runtime.success) {
            const result = {
                success: false,
                message: `GrassSystem 运行时代码不完整，缺少：${runtime.missingFiles.join(', ')}`,
            };
            console.warn(`[grass3d-tools] ${result.message}`);
            return result;
        }

        const parentUuid = parentUuidFromMenu || getSelectedNodeUuid();
        const assetRefs = readRuntimeAssetRefs(runtime.targetDir);
        const result = await Editor.Message.request('scene', 'execute-scene-script', {
            name: PACKAGE_NAME,
            method: 'createGrass3DNodeV2',
            args: [parentUuid, assetRefs],
        });

        if (result && result.uuid) {
            try {
                Editor.Selection.select('node', result.uuid);
            } catch (error) {
                // Selection is a convenience only; creation already succeeded.
            }
        } else if (result && result.message) {
            console.warn(`[grass3d-tools] ${result.message}`);
        }

        return result;
    },

    async installRuntimeAssets() {
        return ensureRuntimeAssets({ forceRefresh: true });
    },
};

async function ensureRuntimeAssets(options = {}) {
    if (runtimeInstallPromise && !options.forceRefresh) {
        return runtimeInstallPromise;
    }

    runtimeInstallPromise = installRuntimeAssets(options).catch((error) => {
        runtimeInstallPromise = null;
        throw error;
    });
    return runtimeInstallPromise;
}

async function installRuntimeAssets(options = {}) {
    const projectPath = getProjectPath();
    if (!projectPath) {
        throw new Error('Cannot resolve Cocos project path.');
    }
    if (!fs.existsSync(RUNTIME_SOURCE_DIR)) {
        throw new Error(`Runtime template is missing: ${RUNTIME_SOURCE_DIR}`);
    }

    const targetDir = path.join(projectPath, 'assets', 'GrassSystem');
    const copiedFiles = [];
    copyMissingRuntimeFiles(RUNTIME_SOURCE_DIR, targetDir, copiedFiles);

    const missingFiles = getMissingRuntimeFiles(targetDir);
    const success = missingFiles.length === 0;

    if (copiedFiles.length > 0 || options.forceRefresh) {
        console.log(`[grass3d-tools] runtime assets ${copiedFiles.length > 0 ? 'installed' : 'refresh requested'}: ${targetDir}`);
        await refreshRuntimeAssets();
        await delay(800);
    }

    if (!success) {
        console.warn('[grass3d-tools] runtime assets are incomplete:', missingFiles);
    }

    return {
        success,
        installed: copiedFiles.length > 0,
        targetDir,
        copiedFiles,
        missingFiles,
    };
}

function getProjectPath() {
    if (Editor.Project) {
        return Editor.Project.path || Editor.Project.projectPath || '';
    }
    return process.cwd();
}

function copyMissingRuntimeFiles(sourceDir, targetDir, copiedFiles, relativeDir = '') {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            copyMissingRuntimeFiles(sourcePath, targetPath, copiedFiles, relativePath);
            continue;
        }
        if (fs.existsSync(targetPath)) {
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
        copiedFiles.push(relativePath);
    }
}

function getMissingRuntimeFiles(targetDir) {
    return REQUIRED_RUNTIME_FILES.filter((file) => !fs.existsSync(path.join(targetDir, file)));
}

function readRuntimeAssetRefs(targetDir) {
    return {
        grassMaterialUuid: readMetaUuid(path.join(targetDir, 'materials', 'GrassBlade_Demo.mtl.meta')),
        groundMaterialUuid: readMetaUuid(path.join(targetDir, 'materials', 'GrassGround_Demo.mtl.meta')),
        densityTextureUuid: readTextureUuid(path.join(targetDir, 'textures', 'GrassDensity_Demo.png.meta')),
    };
}

function readMetaUuid(metaPath) {
    const meta = readJson(metaPath);
    return meta && typeof meta.uuid === 'string' ? meta.uuid : '';
}

function readTextureUuid(metaPath) {
    const meta = readJson(metaPath);
    const redirect = meta && meta.userData && typeof meta.userData.redirect === 'string' ? meta.userData.redirect : '';
    if (redirect) {
        return redirect;
    }
    if (meta && meta.subMetas) {
        for (const subMeta of Object.values(meta.subMetas)) {
            if (subMeta && subMeta.importer === 'texture' && typeof subMeta.uuid === 'string') {
                return subMeta.uuid;
            }
        }
    }
    return meta && typeof meta.uuid === 'string' ? meta.uuid : '';
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return null;
    }
}

async function refreshRuntimeAssets() {
    const calls = [
        ['asset-db', 'refresh-asset', RUNTIME_ASSET_URL],
        ['asset-db', 'refresh-asset', 'db://assets'],
        ['asset-db', 'refresh'],
    ];

    let lastError = null;
    for (const call of calls) {
        try {
            await Editor.Message.request(...call);
            return true;
        } catch (error) {
            lastError = error;
        }
    }

    console.warn('[grass3d-tools] asset-db refresh failed:', lastError);
    return false;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function patchedMenuPopup(menuOrOptions, ...args) {
    try {
        injectGrassMenu(extractMenuTemplate(menuOrOptions));
    } catch (error) {
        console.warn('[grass3d-tools] failed to inject hierarchy menu:', error);
    }
    return originalMenuPopup.call(this, menuOrOptions, ...args);
}

function patchHierarchyContextMenu() {
    if (!Editor.Menu || typeof Editor.Menu.popup !== 'function') {
        console.warn('[grass3d-tools] Editor.Menu.popup is unavailable');
        return;
    }
    originalMenuPopup = Editor.Menu.popup.__grass3dOriginalPopup || Editor.Menu.popup;
    Editor.Menu.popup = patchedMenuPopup;
    Editor.Menu.popup.__grass3dOriginalPopup = originalMenuPopup;
}

function injectGrassMenu(menuTemplate) {
    if (!Array.isArray(menuTemplate)) {
        return;
    }

    const direct3dMenu = find3dObjectMenu(menuTemplate);
    if (direct3dMenu) {
        appendGrassItem(direct3dMenu);
        return;
    }

    for (const item of menuTemplate) {
        const submenu = getSubmenu(item);
        if (!submenu) {
            continue;
        }
        const label = normalizeLabel(item.label);
        if (CREATE_LABELS.has(label)) {
            const nested3dMenu = find3dObjectMenu(submenu);
            if (nested3dMenu) {
                appendGrassItem(nested3dMenu);
                return;
            }
        }
        injectGrassMenu(submenu);
    }
}

function extractMenuTemplate(menuOrOptions) {
    if (Array.isArray(menuOrOptions)) {
        return menuOrOptions;
    }
    if (!menuOrOptions || typeof menuOrOptions !== 'object') {
        return null;
    }
    if (Array.isArray(menuOrOptions.menu)) {
        return menuOrOptions.menu;
    }
    if (Array.isArray(menuOrOptions.template)) {
        return menuOrOptions.template;
    }
    if (menuOrOptions.menu && Array.isArray(menuOrOptions.menu.items)) {
        return menuOrOptions.menu.items;
    }
    if (menuOrOptions.template && Array.isArray(menuOrOptions.template.items)) {
        return menuOrOptions.template.items;
    }
    return null;
}

function find3dObjectMenu(menuTemplate) {
    for (const item of menuTemplate) {
        const submenu = getSubmenu(item);
        if (!submenu) {
            continue;
        }
        const label = normalizeLabel(item.label);
        if (OBJECT_3D_LABELS.has(label) || looksLike3dObjectSubmenu(submenu)) {
            return item;
        }
    }
    return null;
}

function appendGrassItem(object3dMenu) {
    const submenu = getSubmenu(object3dMenu);
    if (!submenu || submenu.some((item) => normalizeLabel(item.label) === GRASS_MENU_LABEL)) {
        return;
    }

    submenu.push({
        label: GRASS_MENU_LABEL,
        click() {
            exports.methods.createGrass3DNode().catch((error) => {
                console.error('[grass3d-tools] create grass node failed:', error);
            });
        },
    });
}

function getSubmenu(item) {
    if (!item) {
        return null;
    }
    if (Array.isArray(item.submenu)) {
        return item.submenu;
    }
    if (item.submenu && Array.isArray(item.submenu.items)) {
        return item.submenu.items;
    }
    return null;
}

function looksLike3dObjectSubmenu(submenu) {
    const labels = submenu.map((item) => normalizeLabel(item.label)).filter(Boolean);
    return BUILTIN_3D_OBJECT_LABELS.some((label) => labels.some((value) => value.includes(label)));
}

function normalizeLabel(label) {
    if (!label || typeof label !== 'string') {
        return '';
    }
    const lastPart = label.split('/').pop() || label;
    return lastPart.replace(/^i18n:/, '').replace(/&/g, '').trim();
}
