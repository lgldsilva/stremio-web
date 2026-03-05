#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BOOL_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOL_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const ALLOWED_BACKENDS = new Set(['auto', 'nvidia', 'vaapi', 'none']);

const parseBool = (value, fallback) => {
    if (typeof value !== 'string' || value.length === 0) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (BOOL_TRUE_VALUES.has(normalized)) {
        return true;
    }
    if (BOOL_FALSE_VALUES.has(normalized)) {
        return false;
    }

    return fallback;
};

const exists = (targetPath) => {
    try {
        return fs.existsSync(targetPath);
    } catch (error) {
        console.warn(`[runtime-config] failed to check path "${targetPath}": ${error.message}`);
        return false;
    }
};

const resolveRequestedBackend = () => {
    const rawValue = process.env.HWACCEL_BACKEND || process.env.STREMIO_HWACCEL_BACKEND || 'auto';
    const normalized = rawValue.toLowerCase();
    if (ALLOWED_BACKENDS.has(normalized)) {
        return normalized;
    }

    console.warn(`[runtime-config] invalid HWACCEL_BACKEND="${rawValue}", falling back to "auto"`);
    return 'auto';
};

const detectBackend = (requestedBackend) => {
    if (requestedBackend !== 'auto') {
        return requestedBackend;
    }

    const hasNvidia = exists('/usr/bin/nvidia-smi') || exists('/dev/nvidiactl');
    if (hasNvidia) {
        return 'nvidia';
    }

    const hasVaapi = exists('/dev/dri/renderD128') || exists('/dev/dri/card0') || exists('/dev/dri');
    if (hasVaapi) {
        return 'vaapi';
    }

    return 'none';
};

const applyLiteralReplacement = (content, searchValue, replaceValue, label) => {
    if (!content.includes(searchValue)) {
        if (content.includes(replaceValue)) {
            console.info(`[runtime-config] ${label}: already applied`);
            return content;
        }

        console.warn(`[runtime-config] ${label}: source pattern not found`);
        return content;
    }

    console.info(`[runtime-config] ${label}: applied`);
    return content.split(searchValue).join(replaceValue);
};

const applyRegexReplacement = (content, pattern, replaceValue, label) => {
    if (!pattern.test(content)) {
        console.warn(`[runtime-config] ${label}: source pattern not found`);
        return content;
    }

    console.info(`[runtime-config] ${label}: applied`);
    return content.replace(pattern, replaceValue);
};

const patchServerJs = (originalContent, backend, enableNvidiaCompatPatch) => {
    let content = originalContent;

    content = applyLiteralReplacement(
        content,
        'df -k',
        'df -Pk',
        'portable df command'
    );

    if (backend !== 'nvidia' || !enableNvidiaCompatPatch) {
        return content;
    }

    content = applyLiteralReplacement(
        content,
        'transcodeHardwareAccel: !1',
        'transcodeHardwareAccel: !0',
        'enable hardware acceleration by default'
    );
    content = applyLiteralReplacement(
        content,
        '"-hwaccel", "cuda", "-hwaccel_output_format", "cuda"',
        '"-hwaccel", "cuda"',
        'drop forced cuda output format'
    );
    content = applyLiteralReplacement(
        content,
        '"-init_hw_device", "cuda=cu:0", "-filter_hw_device", "cu", "-hwaccel"',
        '"-hwaccel"',
        'drop explicit cuda hw device init'
    );
    content = applyLiteralReplacement(
        content,
        'scale: "scale_cuda"',
        'scale: !1',
        'switch nvenc scaling to software path'
    );
    content = applyLiteralReplacement(
        content,
        'wrapSwFilters: [ "hwdownload", "hwupload_cuda" ]',
        'wrapSwFilters: !1',
        'disable hwdownload/hwupload wrapper filters'
    );
    content = applyRegexReplacement(
        content,
        /(nvenc[\s\S]{0,2000}?scaleExtra:\s*)""/,
        '$1":flags=lanczos"',
        'set nvenc scaleExtra lanczos'
    );

    return content;
};

const readJsonFile = (filePath) => {
    if (!exists(filePath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    } catch (error) {
        console.warn(`[runtime-config] failed to parse ${filePath}: ${error.message}`);
    }

    return {};
};

const resolveProfile = (backend) => {
    const explicitProfile = process.env.HWACCEL_PROFILE;
    if (typeof explicitProfile === 'string' && explicitProfile.length > 0) {
        return explicitProfile;
    }

    if (backend === 'nvidia') {
        return 'nvenc-linux';
    }
    if (backend === 'vaapi') {
        return 'vaapi';
    }

    return null;
};

const applyTranscodeSettings = (settings, backend, profile) => {
    if (backend === 'none') {
        settings.transcodeHardwareAccel = false;
        settings.transcodeProfile = null;
        settings.allTranscodeProfiles = [];
        return settings;
    }

    settings.transcodeHardwareAccel = true;
    settings.transcodeProfile = profile;
    settings.allTranscodeProfiles = profile ? [profile] : [];
    return settings;
};

const writeJsonFile = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const main = () => {
    const requestedBackend = resolveRequestedBackend();
    const backend = detectBackend(requestedBackend);
    const enableNvidiaCompatPatch = parseBool(process.env.NVIDIA_COMPAT_PATCH, true);

    const configFolder = process.env.APP_PATH || path.join(process.env.HOME || '/root', '.stremio-server');
    const serverJsPath = path.resolve(process.cwd(), process.env.STREMIO_SERVER_JS || 'server.js');
    const settingsPath = path.resolve(configFolder, process.env.STREMIO_SETTINGS_FILE || 'server-settings.json');
    const profile = resolveProfile(backend);

    console.info(`[runtime-config] requested backend: ${requestedBackend}`);
    console.info(`[runtime-config] resolved backend: ${backend}`);
    console.info(`[runtime-config] selected profile: ${profile || 'none'}`);
    console.info(`[runtime-config] nvidia compatibility patch: ${enableNvidiaCompatPatch ? 'enabled' : 'disabled'}`);

    if (exists(serverJsPath)) {
        const serverJs = fs.readFileSync(serverJsPath, 'utf8');
        const patchedServerJs = patchServerJs(serverJs, backend, enableNvidiaCompatPatch);
        if (patchedServerJs !== serverJs) {
            fs.writeFileSync(serverJsPath, patchedServerJs);
            console.info('[runtime-config] server.js updated');
        } else {
            console.info('[runtime-config] server.js unchanged');
        }
    } else {
        console.warn(`[runtime-config] server.js not found at ${serverJsPath}`);
    }

    const settings = readJsonFile(settingsPath);
    const updatedSettings = applyTranscodeSettings(settings, backend, profile);
    writeJsonFile(settingsPath, updatedSettings);
    console.info(`[runtime-config] settings updated at ${settingsPath}`);
};

main();
