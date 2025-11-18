/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
process.on('uncaughtException', error => {
    console.error('[yavcop] uncaught exception', error);
});
process.on('unhandledRejection', reason => {
    console.error('[yavcop] unhandled rejection', reason);
});
const colorDataCache = new Map();
const pendingColorComputations = new Map();
let providerSubscriptions = [];
let isProbingNativeColors = false;
const DEFAULT_LANGUAGES = [
    'css',
    'scss',
    'sass',
    'less',
    'html',
    'xml',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'json',
    'markdown',
    'plaintext'
];
function activate(context) {
    console.log('[yavcop] activating...');
    registerLanguageProviders(context);
    refreshVisibleEditors();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            void refreshEditor(editor);
        }
    }), vscode.workspace.onDidChangeTextDocument(event => {
        const targetEditor = vscode.window.visibleTextEditors.find(editor => editor.document === event.document);
        if (targetEditor) {
            void refreshEditor(targetEditor);
        }
    }), vscode.workspace.onDidCloseTextDocument(document => {
        clearColorCacheForDocument(document);
    }), vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('yavcop.languages')) {
            registerLanguageProviders(context);
            refreshVisibleEditors();
        }
    }));
}
function deactivate() {
    clearAllDecorations();
}
async function refreshEditor(editor) {
    if (!shouldDecorate(editor.document)) {
        clearDecorationsForEditor(editor);
        return;
    }
    try {
        await ensureColorData(editor.document);
    }
    catch (error) {
        console.error('[yavcop] failed to refresh color data', error);
    }
}
function shouldDecorate(document) {
    const config = vscode.workspace.getConfiguration('yavcop');
    const languages = config.get('languages', DEFAULT_LANGUAGES);
    if (!languages || languages.length === 0) {
        return false;
    }
    if (languages.includes('*')) {
        return true;
    }
    return languages.includes(document.languageId);
}
async function ensureColorData(document) {
    if (!shouldDecorate(document)) {
        clearColorCacheForDocument(document);
        return [];
    }
    const key = document.uri.toString();
    const cached = colorDataCache.get(key);
    if (cached && cached.version === document.version) {
        return cached.data;
    }
    const pending = pendingColorComputations.get(key);
    if (pending) {
        return pending;
    }
    const computation = computeColorData(document)
        .then(data => {
        colorDataCache.set(key, { version: document.version, data });
        pendingColorComputations.delete(key);
        return data;
    })
        .catch(error => {
        pendingColorComputations.delete(key);
        throw error;
    });
    pendingColorComputations.set(key, computation);
    return computation;
}
async function computeColorData(document) {
    const text = document.getText();
    const allColorData = collectColorData(document, text);
    const nativeRanges = await getNativeColorRangeKeys(document);
    if (nativeRanges.size === 0) {
        return allColorData;
    }
    return allColorData.filter(data => !nativeRanges.has(rangeKey(data.range)));
}
async function getNativeColorRangeKeys(document) {
    if (isProbingNativeColors) {
        return new Set();
    }
    isProbingNativeColors = true;
    try {
        const colorInfos = await vscode.commands.executeCommand('vscode.executeDocumentColorProvider', document.uri);
        if (!Array.isArray(colorInfos) || colorInfos.length === 0) {
            return new Set();
        }
        return new Set(colorInfos.map(info => rangeKey(info.range)));
    }
    catch (error) {
        console.warn('[yavcop] native color provider probe failed', error);
        return new Set();
    }
    finally {
        isProbingNativeColors = false;
    }
}
function rangeKey(range) {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}
function clearColorCacheForDocument(document) {
    const key = document.uri.toString();
    colorDataCache.delete(key);
    pendingColorComputations.delete(key);
}
function collectColorData(document, text) {
    const results = [];
    const seenRanges = new Set();
    const pushMatch = (startIndex, matchText) => {
        const range = new vscode.Range(document.positionAt(startIndex), document.positionAt(startIndex + matchText.length));
        const parsed = parseColor(matchText);
        if (!parsed) {
            return;
        }
        const key = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
        if (seenRanges.has(key)) {
            return;
        }
        seenRanges.add(key);
        results.push({
            range,
            originalText: matchText,
            normalizedColor: parsed.cssString,
            vscodeColor: parsed.vscodeColor
        });
    };
    const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    let hexMatch;
    while ((hexMatch = hexRegex.exec(text)) !== null) {
        pushMatch(hexMatch.index, hexMatch[0]);
    }
    const funcRegex = /\b(?:rgb|rgba|hsl|hsla)\(([^\n]*?)\)/gi;
    let funcMatch;
    while ((funcMatch = funcRegex.exec(text)) !== null) {
        const fullMatch = funcMatch[0];
        pushMatch(funcMatch.index, fullMatch);
    }
    const tailwindRegex = /(?<![\w#(])([0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%(?:\s*\/\s*(?:0?\.\d+|1(?:\.0+)?))?)/g;
    let tailwindMatch;
    while ((tailwindMatch = tailwindRegex.exec(text)) !== null) {
        pushMatch(tailwindMatch.index, tailwindMatch[1]);
    }
    return results;
}
async function provideColorHover(document, position) {
    try {
        const colorData = await ensureColorData(document);
        for (const data of colorData) {
            if (data.range.contains(position)) {
                const markdown = new vscode.MarkdownString();
                markdown.isTrusted = true;
                markdown.supportHtml = true;
                markdown.appendMarkdown(`**Color Preview**\n\n`);
                markdown.appendMarkdown(`<span style="display:inline-block;width:20px;height:20px;background-color:${data.normalizedColor};border:1px solid #000;vertical-align:middle;"></span> \`${data.originalText}\``);
                markdown.appendMarkdown(`\n\n*Click the color value to open VS Code's color picker.*`);
                return new vscode.Hover(markdown, data.range);
            }
        }
    }
    catch (error) {
        console.error('[yavcop] failed to provide hover', error);
    }
    return undefined;
}
function clearDecorationsForEditor(editor) {
    clearColorCacheForDocument(editor.document);
}
function clearAllDecorations() {
    colorDataCache.clear();
    pendingColorComputations.clear();
}
async function provideDocumentColors(document) {
    if (isProbingNativeColors) {
        return [];
    }
    try {
        const colors = await ensureColorData(document);
        return colors.map(data => new vscode.ColorInformation(data.range, data.vscodeColor));
    }
    catch (error) {
        console.error('[yavcop] failed to provide document colors', error);
        return [];
    }
}
function provideColorPresentations(color, context) {
    const originalText = context.document.getText(context.range);
    const parsed = parseColor(originalText);
    if (!parsed) {
        return [];
    }
    const formattedValues = parsed.formatPriority
        .map(format => formatColorByFormat(color, format))
        .filter((value) => Boolean(value));
    const uniqueValues = Array.from(new Set(formattedValues));
    if (uniqueValues.length === 0) {
        uniqueValues.push(rgbaString(color, true));
    }
    return uniqueValues.map(value => {
        const presentation = new vscode.ColorPresentation(value);
        presentation.textEdit = vscode.TextEdit.replace(context.range, value);
        return presentation;
    });
}
function parseColorToVSCode(colorValue) {
    const hexMatch = colorValue.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
    if (hexMatch) {
        const r = parseInt(hexMatch[1], 16) / 255;
        const g = parseInt(hexMatch[2], 16) / 255;
        const b = parseInt(hexMatch[3], 16) / 255;
        const a = hexMatch[4] ? parseInt(hexMatch[4], 16) / 255 : 1;
        return new vscode.Color(r, g, b, a);
    }
    const rgbMatch = colorValue.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10) / 255;
        const g = parseInt(rgbMatch[2], 10) / 255;
        const b = parseInt(rgbMatch[3], 10) / 255;
        const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;
        return new vscode.Color(r, g, b, a);
    }
    const hslMatch = colorValue.match(/^hsla?\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%\s*(?:\/\s*([0-9.]+)\s*)?\)$/i);
    if (hslMatch) {
        const h = parseFloat(hslMatch[1]);
        const s = parseFloat(hslMatch[2]);
        const l = parseFloat(hslMatch[3]);
        const a = hslMatch[4] ? parseFloat(hslMatch[4]) : 1;
        const rgb = hslToRgb(h, s, l);
        return new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, a);
    }
    return undefined;
}
function hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    }
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) {
                t += 1;
            }
            if (t > 1) {
                t -= 1;
            }
            if (t < 1 / 6) {
                return p + (q - p) * 6 * t;
            }
            if (t < 1 / 2) {
                return q;
            }
            if (t < 2 / 3) {
                return p + (q - p) * (2 / 3 - t) * 6;
            }
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}
function parseColor(raw) {
    const text = raw.trim();
    const hexMatch = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hexMatch) {
        const normalized = normalizeHex(text);
        if (!normalized) {
            return undefined;
        }
        const color = parseColorToVSCode(normalized);
        if (!color) {
            return undefined;
        }
        const sanitized = text.startsWith('#') ? text.slice(1) : text;
        const hasAlpha = sanitized.length === 4 || sanitized.length === 8;
        const originalFormat = hasAlpha ? 'hexAlpha' : 'hex';
        return {
            vscodeColor: color,
            cssString: rgbaString(color, false),
            formatPriority: getFormatPriority(originalFormat)
        };
    }
    if (/^(?:rgb|rgba)\(/i.test(text)) {
        const rgbaColor = parseRgbFunction(text);
        if (!rgbaColor) {
            return undefined;
        }
        return rgbaColor;
    }
    if (/^(?:hsl|hsla)\(/i.test(text)) {
        const hslColor = parseHslFunction(text);
        if (!hslColor) {
            return undefined;
        }
        return hslColor;
    }
    const tailwindMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%(?:\s*\/\s*(0?\.\d+|1(?:\.0+)?))?$/i);
    if (tailwindMatch) {
        const h = clamp(Number(tailwindMatch[1]), 0, 360);
        const s = clamp(Number(tailwindMatch[2]), 0, 100);
        const l = clamp(Number(tailwindMatch[3]), 0, 100);
        const alpha = normalizeAlpha(tailwindMatch[4]);
        const rgb = hslToRgb(h, s, l);
        const color = new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha);
        return {
            vscodeColor: color,
            cssString: rgbaString(color, false),
            formatPriority: getFormatPriority('tailwind')
        };
    }
    return undefined;
}
function normalizeHex(value) {
    const text = value.startsWith('#') ? value.slice(1) : value;
    const length = text.length;
    if (length !== 3 && length !== 4 && length !== 6 && length !== 8) {
        return undefined;
    }
    if (length === 3 || length === 4) {
        const expanded = text.split('').map(ch => ch + ch).join('');
        return `#${expanded}`;
    }
    return `#${text.toLowerCase()}`;
}
function parseRgbFunction(raw) {
    const match = raw.match(/^rgba?\((.*)\)$/i);
    if (!match) {
        return undefined;
    }
    const parts = match[1]
        .replace(/\//g, ' ')
        .replace(/,/g, ' ')
        .split(/\s+/)
        .map(part => part.trim())
        .filter(part => part.length > 0);
    if (parts.length < 3) {
        return undefined;
    }
    const [rPart, gPart, bPart, aPart] = parts;
    const r = normalizeRgbComponent(rPart);
    const g = normalizeRgbComponent(gPart);
    const b = normalizeRgbComponent(bPart);
    if (r === undefined || g === undefined || b === undefined) {
        return undefined;
    }
    const a = normalizeAlpha(aPart);
    const color = new vscode.Color(r / 255, g / 255, b / 255, a);
    const hasAlphaOriginal = /rgba/i.test(raw) || aPart !== undefined || raw.includes('/');
    const originalFormat = hasAlphaOriginal ? 'rgba' : 'rgb';
    return {
        vscodeColor: color,
        cssString: rgbaString(color, false),
        formatPriority: getFormatPriority(originalFormat)
    };
}
function parseHslFunction(raw) {
    const match = raw.match(/^hsla?\((.*)\)$/i);
    if (!match) {
        return undefined;
    }
    const segments = match[1]
        .replace(/\//g, ' ')
        .replace(/,/g, ' ')
        .split(/\s+/)
        .map(segment => segment.trim())
        .filter(Boolean);
    if (segments.length < 3) {
        return undefined;
    }
    const [hPart, sPart, lPart, aPart] = segments;
    const h = clamp(parseFloat(hPart), 0, 360);
    const s = clamp(parseFloat(sPart.replace('%', '')), 0, 100);
    const l = clamp(parseFloat(lPart.replace('%', '')), 0, 100);
    const a = normalizeAlpha(aPart);
    const rgb = hslToRgb(h, s, l);
    const color = new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, a);
    const hasAlphaOriginal = /hsla/i.test(raw) || aPart !== undefined || raw.includes('/');
    const originalFormat = hasAlphaOriginal ? 'hsla' : 'hsl';
    return {
        vscodeColor: color,
        cssString: rgbaString(color, false),
        formatPriority: getFormatPriority(originalFormat)
    };
}
function normalizeRgbComponent(value) {
    if (value.endsWith('%')) {
        const percent = clamp(parseFloat(value), 0, 100);
        return Math.round((percent / 100) * 255);
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
        return undefined;
    }
    return clamp(Math.round(numeric), 0, 255);
}
function rgbaString(color, forceAlpha = false) {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);
    const a = Number(color.alpha.toFixed(2));
    if (!forceAlpha && a === 1) {
        return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function hexString(color, includeAlpha = false) {
    const r = Math.round(color.red * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.green * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.blue * 255).toString(16).padStart(2, '0');
    const base = `#${r}${g}${b}`;
    if (!includeAlpha) {
        return base;
    }
    const alpha = Math.round(color.alpha * 255).toString(16).padStart(2, '0');
    return `${base}${alpha}`;
}
function hslString(color, forceAlpha = false) {
    const { h, s, l } = rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
    const base = `${round(h)} ${round(s)}% ${round(l)}%`;
    if (!forceAlpha && color.alpha === 1) {
        return `hsl(${base})`;
    }
    return `hsla(${base} / ${color.alpha.toFixed(2)})`;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function round(value) {
    return Math.round(value * 100) / 100;
}
function normalizeAlpha(value) {
    if (value === undefined) {
        return 1;
    }
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
        const percent = clamp(parseFloat(trimmed), 0, 100);
        return percent / 100;
    }
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
        return 1;
    }
    return clamp(numeric, 0, 1);
}
function tailwindString(color) {
    const { h, s, l } = rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
    const base = `${round(h)} ${round(s)}% ${round(l)}%`;
    return color.alpha === 1 ? base : `${base} / ${color.alpha.toFixed(2)}`;
}
function formatColorByFormat(color, format) {
    switch (format) {
        case 'hex':
            return color.alpha === 1 ? hexString(color, false) : undefined;
        case 'hexAlpha':
            return hexString(color, true);
        case 'rgb':
            return color.alpha === 1 ? rgbaString(color, false) : undefined;
        case 'rgba':
            return rgbaString(color, true);
        case 'hsl':
            return color.alpha === 1 ? hslString(color, false) : undefined;
        case 'hsla':
            return hslString(color, true);
        case 'tailwind':
            return tailwindString(color);
        default:
            return undefined;
    }
}
function getFormatPriority(original) {
    const priorityMap = {
        hex: ['hex', 'rgba', 'rgb', 'hexAlpha', 'hsl', 'hsla', 'tailwind'],
        hexAlpha: ['hexAlpha', 'rgba', 'hex', 'hsla', 'hsl', 'tailwind'],
        rgb: ['rgb', 'rgba', 'hex', 'hexAlpha', 'hsl', 'hsla', 'tailwind'],
        rgba: ['rgba', 'hexAlpha', 'hex', 'hsla', 'hsl', 'tailwind'],
        hsl: ['hsl', 'hsla', 'rgba', 'hex', 'hexAlpha', 'tailwind'],
        hsla: ['hsla', 'rgba', 'hexAlpha', 'hex', 'tailwind', 'hsl'],
        tailwind: ['tailwind', 'hsla', 'hsl', 'rgba', 'hexAlpha', 'hex']
    };
    const order = priorityMap[original] ?? ['rgba', 'hex'];
    return Array.from(new Set(order));
}
function registerLanguageProviders(context) {
    providerSubscriptions.forEach(disposable => disposable.dispose());
    providerSubscriptions = [];
    const config = vscode.workspace.getConfiguration('yavcop');
    const languages = config.get('languages', DEFAULT_LANGUAGES);
    if (!languages || languages.length === 0) {
        return;
    }
    let selector;
    if (languages.includes('*')) {
        selector = [
            { scheme: 'file' },
            { scheme: 'untitled' }
        ];
    }
    else {
        selector = languages.map(language => ({ language }));
    }
    const hoverProvider = vscode.languages.registerHoverProvider(selector, {
        provideHover(document, position) {
            return provideColorHover(document, position);
        }
    });
    const colorProvider = vscode.languages.registerColorProvider(selector, {
        provideDocumentColors(document) {
            return provideDocumentColors(document);
        },
        provideColorPresentations(color, context) {
            return provideColorPresentations(color, context);
        }
    });
    providerSubscriptions.push(hoverProvider, colorProvider);
    context.subscriptions.push(hoverProvider, colorProvider);
}
function refreshVisibleEditors() {
    vscode.window.visibleTextEditors.forEach(editor => {
        void refreshEditor(editor);
    });
}


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map