import * as vscode from 'vscode';

process.on('uncaughtException', error => {
    console.error('[yavcop] uncaught exception', error);
});

process.on('unhandledRejection', reason => {
    console.error('[yavcop] unhandled rejection', reason);
});

interface DocumentColorCache {
    version: number;
    data: ColorData[];
}

const colorDataCache = new Map<string, DocumentColorCache>();
const pendingColorComputations = new Map<string, Promise<ColorData[]>>();
const cssVariableRegistry = new Map<string, CSSVariableDeclaration[]>();
const cssClassColorRegistry = new Map<string, CSSClassColorDeclaration[]>();
const cssVariableDecorations = new Map<string, vscode.TextEditorDecorationType>();
let providerSubscriptions: vscode.Disposable[] = [];
let isProbingNativeColors = false;

interface ColorData {
    range: vscode.Range;
    originalText: string;
    normalizedColor: string;
    vscodeColor: vscode.Color;
    isCssVariable?: boolean;
    variableName?: string;
    isWrappedInFunction?: boolean;
    isTailwindClass?: boolean;
    tailwindClass?: string;
    isCssClass?: boolean;
    cssClassName?: string;
}

interface CSSVariableReference {
    range: vscode.Range;
    variableName: string;
    wrappingFunction?: 'hsl' | 'rgb' | 'rgba' | 'hsla';
}

interface CSSVariableDeclaration {
    name: string;
    value: string;
    uri: vscode.Uri;
    line: number;
    selector: string;
    context: CSSVariableContext;
    resolvedValue?: string; // Cached resolved value after nested variable expansion
}

interface CSSVariableContext {
    type: 'root' | 'class' | 'media' | 'other';
    themeHint?: 'light' | 'dark'; // Detected from selector (e.g., .dark, [data-theme="dark"])
    mediaQuery?: string; // For @media contexts
    specificity: number; // CSS specificity score for context resolution
}

interface CSSClassColorDeclaration {
    className: string;
    property: string; // 'color', 'background-color', etc.
    value: string;
    uri: vscode.Uri;
    line: number;
    selector: string;
}

const DEFAULT_LANGUAGES = [
    'css',
    'scss',
    'sass',
    'less',
    'stylus',
    'postcss',
    'html',
    'xml',
    'svg',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'vue',
    'svelte',
    'astro',
    'json',
    'jsonc',
    'yaml',
    'toml',
    'markdown',
    'mdx',
    'plaintext',
    'python',
    'ruby',
    'php',
    'perl',
    'go',
    'rust',
    'java',
    'kotlin',
    'swift',
    'csharp',
    'cpp',
    'c',
    'objective-c',
    'dart',
    'lua',
    'shellscript',
    'powershell',
    'sql',
    'graphql'
];

export function activate(context: vscode.ExtensionContext) {
    console.log('[yavcop] activating...');

    // Index CSS files for variable definitions first (before registering providers)
    const indexingPromise = indexWorkspaceCSSFiles();

    // Watch for CSS file changes
    const cssWatcher = vscode.workspace.createFileSystemWatcher('**/*.css');
    cssWatcher.onDidChange(uri => {
        void vscode.workspace.openTextDocument(uri).then(doc => {
            void parseCSSFile(doc).then(() => {
                // Refresh all visible editors after CSS changes
                refreshVisibleEditors();
            });
        });
    });
    cssWatcher.onDidCreate(uri => {
        void vscode.workspace.openTextDocument(uri).then(doc => {
            void parseCSSFile(doc).then(() => {
                refreshVisibleEditors();
            });
        });
    });
    cssWatcher.onDidDelete(uri => {
        // Remove variables from this file
        for (const [varName, declarations] of cssVariableRegistry.entries()) {
            const filtered = declarations.filter(d => d.uri.toString() !== uri.toString());
            if (filtered.length === 0) {
                cssVariableRegistry.delete(varName);
            } else {
                cssVariableRegistry.set(varName, filtered);
            }
        }
        // Refresh after deletion
        refreshVisibleEditors();
    });
    context.subscriptions.push(cssWatcher);

    // Wait for indexing to complete, then register providers and refresh
    void indexingPromise.then(() => {
        console.log('[yavcop] Initial indexing complete, registering providers');
        registerLanguageProviders(context);
        refreshVisibleEditors();
    });

    // Register command to re-index CSS files (useful for debugging)
    const reindexCommand = vscode.commands.registerCommand('yavcop.reindexCSSFiles', async () => {
        await indexWorkspaceCSSFiles();
        refreshVisibleEditors();
        void vscode.window.showInformationMessage(`YAVCOP: Re-indexed ${cssVariableRegistry.size} CSS variables`);
    });
    context.subscriptions.push(reindexCommand);

    // Register command to show color palette
    const showPaletteCommand = vscode.commands.registerCommand('yavcop.showColorPalette', () => {
        const palette = extractWorkspaceColorPalette();
        const items = Array.from(palette.entries()).map(([colorString, color]) => {
            const r = Math.round(color.red * 255);
            const g = Math.round(color.green * 255);
            const b = Math.round(color.blue * 255);
            return {
                label: colorString,
                description: `RGB(${r}, ${g}, ${b})`,
                detail: `Used in workspace CSS variables`
            };
        });
        
        if (items.length === 0) {
            void vscode.window.showInformationMessage('No colors found in workspace CSS variables.');
        } else {
            void vscode.window.showQuickPick(items, {
                title: `Workspace Color Palette (${items.length} unique colors)`,
                placeHolder: 'Browse colors defined in your CSS variables'
            });
        }
    });
    context.subscriptions.push(showPaletteCommand);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                void refreshEditor(editor);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const targetEditor = vscode.window.visibleTextEditors.find(editor => editor.document === event.document);
            if (targetEditor) {
                void refreshEditor(targetEditor);
            }
        }),
        vscode.workspace.onDidCloseTextDocument(document => {
            clearColorCacheForDocument(document);
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('yavcop.languages')) {
                registerLanguageProviders(context);
                refreshVisibleEditors();
            }
        })
    );
}

export function deactivate() {
    clearAllDecorations();
}

async function refreshEditor(editor: vscode.TextEditor): Promise<void> {
    if (!shouldDecorate(editor.document)) {
        clearDecorationsForEditor(editor);
        return;
    }

    try {
        const colorData = await ensureColorData(editor.document);
        applyCSSVariableDecorations(editor, colorData);
    } catch (error) {
        console.error('[yavcop] failed to refresh color data', error);
    }
}

function shouldDecorate(document: vscode.TextDocument): boolean {
    const config = vscode.workspace.getConfiguration('yavcop');
    const languages = config.get<string[]>('languages', DEFAULT_LANGUAGES);
    if (!languages || languages.length === 0) {
        return false;
    }

    if (languages.includes('*')) {
        return true;
    }

    return languages.includes(document.languageId);
}

async function ensureColorData(document: vscode.TextDocument): Promise<ColorData[]> {
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

async function computeColorData(document: vscode.TextDocument): Promise<ColorData[]> {
    const text = document.getText();
    const allColorData = collectColorData(document, text);
    const nativeRanges = await getNativeColorRangeKeys(document);

    if (nativeRanges.size === 0) {
        return allColorData;
    }

    return allColorData.filter(data => !nativeRanges.has(rangeKey(data.range)));
}

async function getNativeColorRangeKeys(document: vscode.TextDocument): Promise<Set<string>> {
    if (isProbingNativeColors) {
        return new Set();
    }

    isProbingNativeColors = true;
    try {
        const colorInfos = await vscode.commands.executeCommand<vscode.ColorInformation[] | undefined>(
            'vscode.executeDocumentColorProvider',
            document.uri
        );

        if (!Array.isArray(colorInfos) || colorInfos.length === 0) {
            return new Set();
        }

        return new Set(colorInfos.map(info => rangeKey(info.range)));
    } catch (error) {
        console.warn('[yavcop] native color provider probe failed', error);
        return new Set();
    } finally {
        isProbingNativeColors = false;
    }
}

function rangeKey(range: vscode.Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function clearColorCacheForDocument(document: vscode.TextDocument) {
    const key = document.uri.toString();
    colorDataCache.delete(key);
    pendingColorComputations.delete(key);
}

function applyCSSVariableDecorations(editor: vscode.TextEditor, colorData: ColorData[]): void {
    // Clear previous decorations for this editor
    const editorKey = editor.document.uri.toString();
    const existingDecorations = cssVariableDecorations.get(editorKey);
    if (existingDecorations) {
        existingDecorations.dispose();
    }

    // Collect all CSS variable and CSS class color ranges
    const decorationRanges: vscode.Range[] = [];
    const colorsByRange = new Map<string, string>();
    
    for (const data of colorData) {
        // Include CSS variables (not wrapped in functions) and CSS class colors
        if ((data.isCssVariable && !data.isWrappedInFunction) || data.isCssClass) {
            decorationRanges.push(data.range);
            const rangeKey = `${data.range.start.line}:${data.range.start.character}`;
            colorsByRange.set(rangeKey, data.normalizedColor);
        }
    }

    if (decorationRanges.length === 0) {
        cssVariableDecorations.delete(editorKey);
        return;
    }

    // Create a single decoration type for all CSS variables
    const decoration = vscode.window.createTextEditorDecorationType({
        before: {
            contentText: '',
            border: '1px solid',
            borderColor: '#fff',
            width: '10px',
            height: '10px',
            margin: '1px 4px 0 0'
        },
        backgroundColor: 'transparent'
    });

    // Apply decorations with individual colors
    const decorationRangesWithOptions: { range: vscode.Range; renderOptions?: vscode.DecorationRenderOptions }[] = [];
    for (const range of decorationRanges) {
        const rangeKey = `${range.start.line}:${range.start.character}`;
        const color = colorsByRange.get(rangeKey);
        if (color) {
            decorationRangesWithOptions.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor: color,
                        border: '1px solid #fff',
                        width: '10px',
                        height: '10px',
                        margin: '1px 4px 0 0'
                    }
                }
            });
        }
    }

    if (decorationRangesWithOptions.length > 0) {
        editor.setDecorations(decoration, decorationRangesWithOptions);
        cssVariableDecorations.set(editorKey, decoration);
    }
}

async function parseCSSFile(document: vscode.TextDocument): Promise<void> {
    const text = document.getText();
    
    // Simple regex-based CSS variable extraction
    // Matches patterns like: --variable-name: value;
    const cssVarRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;

    while ((match = cssVarRegex.exec(text)) !== null) {
        const varName = match[1];
        const value = match[2].trim();
        
        // Find which selector this variable belongs to
        const position = document.positionAt(match.index);
        const selector = findContainingSelector(text, match.index);
        const context = analyzeContext(selector);
        
        const declaration: CSSVariableDeclaration = {
            name: varName,
            value: value,
            uri: document.uri,
            line: position.line,
            selector: selector,
            context: context
        };

        // Add to registry
        if (!cssVariableRegistry.has(varName)) {
            cssVariableRegistry.set(varName, []);
        }
        cssVariableRegistry.get(varName)!.push(declaration);
    }
    
    // Extract CSS class colors
    // Matches patterns like: .className { color: value; }
    const colorPropertyRegex = /\.([\.\w-]+)\s*\{[^}]*?(color|background-color|border-color|background)\s*:\s*([^;]+);/g;
    let colorMatch: RegExpExecArray | null;
    
    while ((colorMatch = colorPropertyRegex.exec(text)) !== null) {
        const className = colorMatch[1];
        const property = colorMatch[2];
        const value = colorMatch[3].trim();
        
        // Try to resolve if it's a color value or CSS variable reference
        let resolvedValue = value;
        const varMatch = value.match(/var\(\s*(--[\w-]+)\s*\)/);
        if (varMatch) {
            const varName = varMatch[1];
            const varDeclarations = cssVariableRegistry.get(varName);
            if (varDeclarations && varDeclarations.length > 0) {
                resolvedValue = resolveNestedVariables(varDeclarations[0].value);
            }
        }
        
        // Check if the value is a color
        const parsed = parseColor(resolvedValue);
        if (parsed) {
            const position = document.positionAt(colorMatch.index);
            const selector = findContainingSelector(text, colorMatch.index);
            
            const declaration: CSSClassColorDeclaration = {
                className: className,
                property: property,
                value: resolvedValue,
                uri: document.uri,
                line: position.line,
                selector: selector
            };
            
            if (!cssClassColorRegistry.has(className)) {
                cssClassColorRegistry.set(className, []);
            }
            cssClassColorRegistry.get(className)!.push(declaration);
        }
    }
}

function findContainingSelector(text: string, varIndex: number): string {
    // Find the nearest selector before this variable declaration
    // Look backwards for the opening brace, then find the selector
    const beforeVar = text.substring(0, varIndex);
    const lastOpenBrace = beforeVar.lastIndexOf('{');
    
    if (lastOpenBrace === -1) {
        return ':root';
    }

    // Find the selector before the brace
    const beforeBrace = text.substring(0, lastOpenBrace);
    const lines = beforeBrace.split('\n');
    
    // Go backwards to find the selector
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line && !line.startsWith('/*') && !line.endsWith('*/')) {
            return line.replace(/\s+/g, ' ').trim();
        }
    }
    
    return ':root';
}

function analyzeContext(selector: string): CSSVariableContext {
    const normalizedSelector = selector.toLowerCase().trim();
    
    // Calculate basic specificity (simplified CSS specificity)
    let specificity = 0;
    if (normalizedSelector === ':root' || normalizedSelector === 'html') {
        specificity = 1;
    } else if (normalizedSelector.includes('.')) {
        specificity = 10 + (normalizedSelector.match(/\./g) || []).length * 10;
    } else if (normalizedSelector.includes('#')) {
        specificity = 100;
    }
    
    // Detect context type
    let type: 'root' | 'class' | 'media' | 'other' = 'other';
    if (normalizedSelector === ':root' || normalizedSelector === 'html') {
        type = 'root';
    } else if (normalizedSelector.includes('.') || normalizedSelector.includes('[')) {
        type = 'class';
    } else if (normalizedSelector.includes('@media')) {
        type = 'media';
    }
    
    // Detect theme hints
    let themeHint: 'light' | 'dark' | undefined;
    if (normalizedSelector.includes('.dark') || 
        normalizedSelector.includes('[data-theme="dark"]') ||
        normalizedSelector.includes('[data-mode="dark"]')) {
        themeHint = 'dark';
    } else if (normalizedSelector.includes('.light') || 
               normalizedSelector.includes('[data-theme="light"]')) {
        themeHint = 'light';
    }
    
    // Extract media query if present
    let mediaQuery: string | undefined;
    const mediaMatch = selector.match(/@media\s+([^{]+)/);
    if (mediaMatch) {
        mediaQuery = mediaMatch[1].trim();
    }
    
    return {
        type,
        themeHint,
        mediaQuery,
        specificity
    };
}
async function indexWorkspaceCSSFiles(): Promise<void> {
    console.log('[yavcop] Indexing CSS files for variable definitions...');
    cssVariableRegistry.clear();
    cssClassColorRegistry.clear();

    const cssFiles = await vscode.workspace.findFiles('**/*.css', '**/node_modules/**', 100);
    
    for (const fileUri of cssFiles) {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await parseCSSFile(document);
        } catch (error) {
            console.error(`[yavcop] Error parsing CSS file ${fileUri.fsPath}:`, error);
        }
    }
}

function resolveNestedVariables(
    value: string, 
    visitedVars: Set<string> = new Set()
): string {
    // Detect and resolve nested var() references recursively
    const varPattern = /var\(\s*(--[\w-]+)\s*\)/g;
    let match: RegExpExecArray | null;
    let resolvedValue = value;
    
    while ((match = varPattern.exec(value)) !== null) {
        const nestedVarName = match[1];
        
        // Circular reference detection
        if (visitedVars.has(nestedVarName)) {
            console.error(`[yavcop] Circular reference detected: ${nestedVarName}`);
            return value; // Return original value to avoid infinite loop
        }
        
        // Look up the nested variable
        const nestedDeclarations = cssVariableRegistry.get(nestedVarName);
        if (!nestedDeclarations || nestedDeclarations.length === 0) {
            continue; // Can't resolve, keep as-is
        }
        
        // Use the first declaration (prioritize :root)
        const nestedDecl = nestedDeclarations.sort((a, b) => 
            a.context.specificity - b.context.specificity
        )[0];
        
        // Mark this variable as visited
        const newVisited = new Set(visitedVars);
        newVisited.add(nestedVarName);
        
        // Recursively resolve the nested variable's value
        const nestedResolved = resolveNestedVariables(nestedDecl.value, newVisited);
        
        // Replace the var() reference with the resolved value
        resolvedValue = resolvedValue.replace(match[0], nestedResolved);
    }
    
    return resolvedValue;
}

function collectCSSVariableReference(
    document: vscode.TextDocument,
    startIndex: number,
    fullMatch: string,
    variableName: string,
    results: ColorData[],
    seenRanges: Set<string>,
    wrappingFunction?: 'hsl' | 'hsla' | 'rgb' | 'rgba'
): void {
    const range = new vscode.Range(
        document.positionAt(startIndex),
        document.positionAt(startIndex + fullMatch.length)
    );

    const key = rangeKey(range);
    if (seenRanges.has(key)) {
        return;
    }

    // Try to resolve the CSS variable
    const declarations = cssVariableRegistry.get(variableName);
    if (!declarations || declarations.length === 0) {
        return;
    }

    // Use the first declaration (prioritize :root context)
    const declaration = declarations.sort((a, b) => 
        a.context.specificity - b.context.specificity
    )[0];
    
    // Resolve nested variables recursively
    let colorValue = resolveNestedVariables(declaration.value);

    // If wrapped in a color function, prepend it
    if (wrappingFunction) {
        colorValue = `${wrappingFunction}(${colorValue})`;
    }

    // Try to parse the resolved value as a color
    const parsed = parseColor(colorValue);
    if (!parsed) {
        return;
    }

    seenRanges.add(key);

    results.push({
        range,
        originalText: fullMatch,
        normalizedColor: parsed.cssString,
        vscodeColor: parsed.vscodeColor,
        isCssVariable: true,
        variableName: variableName,
        isWrappedInFunction: !!wrappingFunction
    });
}

function collectColorData(document: vscode.TextDocument, text: string): ColorData[] {
    const results: ColorData[] = [];
    const seenRanges = new Set<string>();

    const pushMatch = (startIndex: number, matchText: string) => {
        const range = new vscode.Range(
            document.positionAt(startIndex),
            document.positionAt(startIndex + matchText.length)
        );

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
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexRegex.exec(text)) !== null) {
        pushMatch(hexMatch.index, hexMatch[0]);
    }

    const funcRegex = /\b(?:rgb|rgba|hsl|hsla)\(([^\n]*?)\)/gi;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = funcRegex.exec(text)) !== null) {
        const fullMatch = funcMatch[0];
        pushMatch(funcMatch.index, fullMatch);
    }

    const tailwindRegex = /(?<![\w#(])([0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%(?:\s*\/\s*(?:0?\.\d+|1(?:\.0+)?))?)/g;
    let tailwindMatch: RegExpExecArray | null;
    while ((tailwindMatch = tailwindRegex.exec(text)) !== null) {
        pushMatch(tailwindMatch.index, tailwindMatch[1]);
    }

    // Detect CSS variables: var(--variable-name)
    const varRegex = /var\(\s*(--[\w-]+)\s*\)/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varRegex.exec(text)) !== null) {
        collectCSSVariableReference(document, varMatch.index, varMatch[0], varMatch[1], results, seenRanges);
    }

    // Detect CSS variables wrapped in color functions: hsl(var(--variable)), rgb(var(--variable))
    const varInFuncRegex = /\b(hsl|hsla|rgb|rgba)\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)/gi;
    let varInFuncMatch: RegExpExecArray | null;
    while ((varInFuncMatch = varInFuncRegex.exec(text)) !== null) {
        collectCSSVariableReference(document, varInFuncMatch.index, varInFuncMatch[0], varInFuncMatch[2], results, seenRanges, varInFuncMatch[1] as 'hsl' | 'hsla' | 'rgb' | 'rgba');
    }

    // Detect Tailwind color classes: bg-primary, text-accent, border-destructive, etc.
    const tailwindClassRegex = /\b(bg|text|border|ring|shadow|from|via|to|outline|decoration|divide|accent|caret)-(\w+(?:-\w+)?)\b/g;
    let twClassMatch: RegExpExecArray | null;
    while ((twClassMatch = tailwindClassRegex.exec(text)) !== null) {
        collectTailwindClass(document, twClassMatch.index, twClassMatch[0], twClassMatch[2], results, seenRanges);
    }
    
    // Detect CSS class names with color properties: plums, bonk, etc.
    const classNameRegex = /class\s*=\s*["']([^"']+)["']/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classNameRegex.exec(text)) !== null) {
        const classList = classMatch[1].split(/\s+/);
        for (const className of classList) {
            if (className && cssClassColorRegistry.has(className)) {
                collectCSSClassColor(document, text, classMatch.index + classMatch[0].indexOf(className), className, results, seenRanges);
            }
        }
    }

    return results;
}

function collectTailwindClass(
    document: vscode.TextDocument,
    startIndex: number,
    fullMatch: string,
    colorName: string,
    results: ColorData[],
    seenRanges: Set<string>
): void {
    // Map Tailwind class to CSS variable name
    const variableName = `--${colorName}`;
    
    const range = new vscode.Range(
        document.positionAt(startIndex),
        document.positionAt(startIndex + fullMatch.length)
    );

    const key = rangeKey(range);
    if (seenRanges.has(key)) {
        return;
    }

    // Try to resolve the CSS variable
    const declarations = cssVariableRegistry.get(variableName);
    if (!declarations || declarations.length === 0) {
        // Class doesn't map to a known CSS variable
        return;
    }

    // Use the first declaration (prioritize :root context)
    const declaration = declarations.sort((a, b) => 
        a.context.specificity - b.context.specificity
    )[0];
    
    // Resolve nested variables recursively
    let colorValue = resolveNestedVariables(declaration.value);

    // Try to parse the resolved value as a color
    const parsed = parseColor(colorValue);
    if (!parsed) {
        return;
    }

    seenRanges.add(key);

    results.push({
        range,
        originalText: fullMatch,
        normalizedColor: parsed.cssString,
        vscodeColor: parsed.vscodeColor,
        isTailwindClass: true,
        tailwindClass: fullMatch,
        isCssVariable: true,
        variableName: variableName
    });
}

function collectCSSClassColor(
    document: vscode.TextDocument,
    text: string,
    startIndex: number,
    className: string,
    results: ColorData[],
    seenRanges: Set<string>
): void {
    const range = new vscode.Range(
        document.positionAt(startIndex),
        document.positionAt(startIndex + className.length)
    );

    const key = rangeKey(range);
    if (seenRanges.has(key)) {
        return;
    }

    // Get the CSS class color declarations
    const declarations = cssClassColorRegistry.get(className);
    if (!declarations || declarations.length === 0) {
        return;
    }

    // Use the first declaration
    const declaration = declarations[0];
    
    // Resolve any CSS variables in the value
    const resolvedValue = resolveNestedVariables(declaration.value);
    const parsed = parseColor(resolvedValue);
    if (!parsed) {
        return;
    }

    seenRanges.add(key);

    results.push({
        range,
        originalText: className,
        normalizedColor: parsed.cssString,
        vscodeColor: parsed.vscodeColor,
        isCssClass: true,
        cssClassName: className
    });
}

function createColorSwatchDataUri(color: string): string {
    const sanitizedColor = color.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="${sanitizedColor}" stroke="white" stroke-width="1" /></svg>`;
    const encodedSvg = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${encodedSvg}`;
}

async function provideColorHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    try {
        const colorData = await ensureColorData(document);
        for (const data of colorData) {
            if (data.range.contains(position)) {
                const markdown = new vscode.MarkdownString('', true); // Enable trusted mode from constructor
                markdown.supportHtml = true;

                if (data.isCssClass && data.cssClassName) {
                    // Show CSS class color information
                    const declarations = cssClassColorRegistry.get(data.cssClassName);
                    
                    if (declarations && declarations.length > 0) {
                        const swatchColor = rgbaString(data.vscodeColor, false);
                        const swatchUri = createColorSwatchDataUri(swatchColor);
                        markdown.appendMarkdown(`### CSS Class Color\n\n`);
                        markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.cssClassName}\`\n\n`);
                        
                        markdown.appendMarkdown(`**Property:** \`${declarations[0].property}\`\n\n`);
                        markdown.appendMarkdown(`**Value:** \`${declarations[0].value}\`\n\n`);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        
                        for (const decl of declarations) {
                            markdown.appendMarkdown(`Defined at [${vscode.workspace.asRelativePath(decl.uri)}:${decl.line + 1}](${decl.uri.toString()}#L${decl.line + 1})\n\n`);
                        }
                        
                        // Add accessibility information
                        const white = new vscode.Color(1, 1, 1, 1);
                        const black = new vscode.Color(0, 0, 0, 1);
                        
                        const contrastWhite = getContrastRatio(data.vscodeColor, white);
                        const contrastBlack = getContrastRatio(data.vscodeColor, black);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        markdown.appendMarkdown(`**Accessibility:**\n\n`);
                        
                        const whiteLevel = getAccessibilityLevel(contrastWhite);
                        const blackLevel = getAccessibilityLevel(contrastBlack);
                        
                        markdown.appendMarkdown(`On white: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                        markdown.appendMarkdown(`On black: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    }
                } else if (data.isCssVariable && data.variableName) {
                    // Show CSS variable or Tailwind class information
                    const declarations = cssVariableRegistry.get(data.variableName);
                    
                    if (!declarations || declarations.length === 0) {
                        // Handle undefined variable
                        markdown.appendMarkdown(`### CSS Variable Not Found\n\n`);
                        markdown.appendMarkdown(`\`${data.originalText}\`\n\n`);
                        markdown.appendMarkdown(`**Variable:** \`${data.variableName}\`\n\n`);
                        markdown.appendMarkdown(`This variable is not defined in any CSS files in the workspace.\n\n`);
                        markdown.appendMarkdown(`*Make sure the variable is declared in a CSS file.*`);
                    } else {
                        // Check if this is a Tailwind class
                        if (data.isTailwindClass && data.tailwindClass) {
                            const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                            markdown.appendMarkdown(`### Tailwind Color Class\n\n`);
                            markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.tailwindClass}\`\n\n`);
                            markdown.appendMarkdown(`**Maps to:** \`${data.variableName}\`\n\n`);
                            markdown.appendMarkdown(`---\n\n`);
                        } else {
                            const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                            markdown.appendMarkdown(`### CSS Variable Color\n\n`);
                            markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.originalText}\`\n\n`);
                        }
                        
                        // Sort by specificity (root first, then themed variants)
                        const sorted = [...declarations].sort((a, b) => a.context.specificity - b.context.specificity);
                        
                        // Separate by theme
                        const rootDecl = sorted.find(d => d.context.type === 'root');
                        const darkDecl = sorted.find(d => d.context.themeHint === 'dark');
                        const lightDecl = sorted.find(d => d.context.themeHint === 'light');
                        
                        if (!data.isTailwindClass) {
                            markdown.appendMarkdown(`**Variable:** \`${data.variableName}\`\n\n`);
                            markdown.appendMarkdown(`---\n\n`);
                        }
                        
                        // Show resolved values for different contexts
                        if (rootDecl) {
                            const resolvedRoot = resolveNestedVariables(rootDecl.value);
                            const rootParsed = parseColor(resolvedRoot);
                            if (rootParsed) {
                                const swatchUri = createColorSwatchDataUri(rootParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **Default:** \`${resolvedRoot}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**Default:** \`${resolvedRoot}\`\n\n`);
                            }
                            markdown.appendMarkdown(`Defined at [${vscode.workspace.asRelativePath(rootDecl.uri)}:${rootDecl.line + 1}](${rootDecl.uri.toString()}#L${rootDecl.line + 1})\n\n`);
                        }
                        
                        // Show light theme variant if available
                        if (lightDecl && lightDecl !== rootDecl) {
                            const resolvedLight = resolveNestedVariables(lightDecl.value);
                            const lightParsed = parseColor(resolvedLight);
                            if (lightParsed) {
                                const swatchUri = createColorSwatchDataUri(lightParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **Light Theme:** \`${resolvedLight}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**Light Theme:** \`${resolvedLight}\`\n\n`);
                            }
                            markdown.appendMarkdown(`Defined at [${vscode.workspace.asRelativePath(lightDecl.uri)}:${lightDecl.line + 1}](${lightDecl.uri.toString()}#L${lightDecl.line + 1})\n\n`);
                        }
                        
                        // Show dark theme variant if available
                        if (darkDecl) {
                            const resolvedDark = resolveNestedVariables(darkDecl.value);
                            const darkParsed = parseColor(resolvedDark);
                            if (darkParsed) {
                                const swatchUri = createColorSwatchDataUri(darkParsed.cssString);
                                markdown.appendMarkdown(`![color swatch](${swatchUri}) **Dark Theme:** \`${resolvedDark}\`\n\n`);
                            } else {
                                markdown.appendMarkdown(`**Dark Theme:** \`${resolvedDark}\`\n\n`);
                            }
                            markdown.appendMarkdown(`Defined at [${vscode.workspace.asRelativePath(darkDecl.uri)}:${darkDecl.line + 1}](${darkDecl.uri.toString()}#L${darkDecl.line + 1})\n\n`);
                        }
                        
                        // Show all other definition locations (deduplicated by resolved value)
                        const otherDecls = sorted.filter(d => d !== rootDecl && d !== darkDecl && d !== lightDecl);
                        if (otherDecls.length > 0) {
                            // Deduplicate by resolved value
                            const seenValues = new Set<string>();
                            const uniqueOtherDecls = otherDecls.filter(decl => {
                                const resolved = resolveNestedVariables(decl.value);
                                if (seenValues.has(resolved)) {
                                    return false;
                                }
                                seenValues.add(resolved);
                                return true;
                            });
                            
                            if (uniqueOtherDecls.length > 0) {
                                markdown.appendMarkdown(`---\n\n`);
                                markdown.appendMarkdown(`**Other Definitions (${uniqueOtherDecls.length}):**\n\n`);
                                for (const decl of uniqueOtherDecls) {
                                    const resolvedOther = resolveNestedVariables(decl.value);
                                    const otherParsed = parseColor(resolvedOther);
                                    if (otherParsed) {
                                        const swatchUri = createColorSwatchDataUri(otherParsed.cssString);
                                        markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${resolvedOther}\` at [${vscode.workspace.asRelativePath(decl.uri)}:${decl.line + 1}](${decl.uri.toString()}#L${decl.line + 1})\n\n`);
                                    } else {
                                        markdown.appendMarkdown(`\`${resolvedOther}\` at [${vscode.workspace.asRelativePath(decl.uri)}:${decl.line + 1}](${decl.uri.toString()}#L${decl.line + 1})\n\n`);
                                    }
                                }
                            }
                        }
                        
                        // Add accessibility information for CSS variables and Tailwind classes
                        const white = new vscode.Color(1, 1, 1, 1);
                        const black = new vscode.Color(0, 0, 0, 1);
                        
                        const contrastWhite = getContrastRatio(data.vscodeColor, white);
                        const contrastBlack = getContrastRatio(data.vscodeColor, black);
                        
                        markdown.appendMarkdown(`---\n\n`);
                        markdown.appendMarkdown(`**Accessibility:**\n\n`);
                        
                        const whiteLevel = getAccessibilityLevel(contrastWhite);
                        const blackLevel = getAccessibilityLevel(contrastBlack);
                        
                        markdown.appendMarkdown(`On white: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                        markdown.appendMarkdown(`On black: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    }
                } else {
                    // Show regular color information with format details
                    const swatchUri = createColorSwatchDataUri(data.normalizedColor);
                    markdown.appendMarkdown(`### Color Preview\n\n`);
                    markdown.appendMarkdown(`![color swatch](${swatchUri}) \`${data.originalText}\`\n\n`);
                    
                    // Detect format type
                    let formatType = 'Unknown';
                    if (data.originalText.startsWith('#')) {
                        formatType = 'Hex';
                    } else if (data.originalText.startsWith('rgb')) {
                        formatType = 'RGB/RGBA';
                    } else if (data.originalText.startsWith('hsl')) {
                        formatType = 'HSL/HSLA';
                    } else if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(data.originalText)) {
                        formatType = 'Tailwind HSL';
                    }
                    
                    markdown.appendMarkdown(`**Format:** ${formatType}\n\n`);
                    
                    // Show normalized value if different from original
                    if (data.normalizedColor !== data.originalText) {
                        markdown.appendMarkdown(`**Normalized:** \`${data.normalizedColor}\`\n\n`);
                    }
                    
                    // Show RGB values
                    const r = Math.round(data.vscodeColor.red * 255);
                    const g = Math.round(data.vscodeColor.green * 255);
                    const b = Math.round(data.vscodeColor.blue * 255);
                    const a = data.vscodeColor.alpha;
                    
                    markdown.appendMarkdown(`**RGB:** ${r}, ${g}, ${b}`);
                    if (a < 1) {
                        markdown.appendMarkdown(` (α: ${a.toFixed(2)})`);
                    }
                    markdown.appendMarkdown(`\n\n`);
                    
                    // Add accessibility check against common backgrounds
                    const luminance = getRelativeLuminance(data.vscodeColor);
                    const white = new vscode.Color(1, 1, 1, 1);
                    const black = new vscode.Color(0, 0, 0, 1);
                    
                    const contrastWhite = getContrastRatio(data.vscodeColor, white);
                    const contrastBlack = getContrastRatio(data.vscodeColor, black);
                    
                    markdown.appendMarkdown(`**Accessibility:**\n\n`);
                    
                    const whiteLevel = getAccessibilityLevel(contrastWhite);
                    const blackLevel = getAccessibilityLevel(contrastBlack);
                    
                    markdown.appendMarkdown(`On white: ${contrastWhite.toFixed(2)}:1 (${whiteLevel.level})\n\n`);
                    markdown.appendMarkdown(`On black: ${contrastBlack.toFixed(2)}:1 (${blackLevel.level})\n\n`);
                    
                    markdown.appendMarkdown(`---\n\n`);
                }

                return new vscode.Hover(markdown, data.range);
            }
        }
    } catch (error) {
        console.error('[yavcop] failed to provide hover', error);
    }

    return undefined;
}

function clearDecorationsForEditor(editor: vscode.TextEditor) {
    clearColorCacheForDocument(editor.document);
    
    // Clear CSS variable decorations
    const editorKey = editor.document.uri.toString();
    const decoration = cssVariableDecorations.get(editorKey);
    if (decoration) {
        decoration.dispose();
        cssVariableDecorations.delete(editorKey);
    }
}

function clearAllDecorations() {
    colorDataCache.clear();
    pendingColorComputations.clear();
    
    // Dispose all CSS variable decorations
    for (const decoration of cssVariableDecorations.values()) {
        decoration.dispose();
    }
    cssVariableDecorations.clear();
}

async function provideDocumentColors(document: vscode.TextDocument): Promise<vscode.ColorInformation[]> {
    if (isProbingNativeColors) {
        return [];
    }

    try {
        const colors = await ensureColorData(document);
        // Exclude CSS variables and CSS classes from the color picker - they're shown in hover tooltips only
        return colors
            .filter(data => !data.isCssVariable && !data.isCssClass)
            .map(data => new vscode.ColorInformation(data.range, data.vscodeColor));
    } catch (error) {
        console.error('[yavcop] failed to provide document colors', error);
        return [];
    }
}

function provideColorPresentations(color: vscode.Color, context: { document: vscode.TextDocument; range: vscode.Range }): vscode.ColorPresentation[] {
    const originalText = context.document.getText(context.range);
    const parsed = parseColor(originalText);

    if (!parsed) {
        return [];
    }

    const formattedValues = parsed.formatPriority
        .map(format => formatColorByFormat(color, format))
        .filter((value): value is string => Boolean(value));

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

function parseColorToVSCode(colorValue: string): vscode.Color | undefined {
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

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) { t += 1; }
            if (t > 1) { t -= 1; }
            if (t < 1/6) { return p + (q - p) * 6 * t; }
            if (t < 1/2) { return q; }
            if (t < 2/3) { return p + (q - p) * (2/3 - t) * 6; }
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

type ColorFormat = 'hex' | 'hexAlpha' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'tailwind';

interface ParsedColor {
    vscodeColor: vscode.Color;
    cssString: string;
    formatPriority: ColorFormat[];
}

function parseColor(raw: string): ParsedColor | undefined {
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
        const originalFormat: ColorFormat = hasAlpha ? 'hexAlpha' : 'hex';
        return {
            vscodeColor: color,
            cssString: rgbaString(color, false),
            formatPriority: getFormatPriority(originalFormat)
        } satisfies ParsedColor;
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
        } satisfies ParsedColor;
    }

    return undefined;
}

function normalizeHex(value: string): string | undefined {
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

function parseRgbFunction(raw: string): ParsedColor | undefined {
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
    const originalFormat: ColorFormat = hasAlphaOriginal ? 'rgba' : 'rgb';

    return {
        vscodeColor: color,
        cssString: rgbaString(color, false),
        formatPriority: getFormatPriority(originalFormat)
    } satisfies ParsedColor;
}

function parseHslFunction(raw: string): ParsedColor | undefined {
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
    const originalFormat: ColorFormat = hasAlphaOriginal ? 'hsla' : 'hsl';

    return {
        vscodeColor: color,
        cssString: rgbaString(color, false),
        formatPriority: getFormatPriority(originalFormat)
    } satisfies ParsedColor;
}

function normalizeRgbComponent(value: string): number | undefined {
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

function rgbaString(color: vscode.Color, forceAlpha = false): string {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);
    const a = Number(color.alpha.toFixed(2));
    if (!forceAlpha && a === 1) {
        return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hexString(color: vscode.Color, includeAlpha = false): string {
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

function hslString(color: vscode.Color, forceAlpha = false): string {
    const { h, s, l } = rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
    const base = `${round(h)} ${round(s)}% ${round(l)}%`;
    if (!forceAlpha && color.alpha === 1) {
        return `hsl(${base})`;
    }
    return `hsla(${base} / ${color.alpha.toFixed(2)})`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizeAlpha(value: string | undefined): number {
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

function tailwindString(color: vscode.Color): string {
    const { h, s, l } = rgbToHsl(color.red * 255, color.green * 255, color.blue * 255);
    const base = `${round(h)} ${round(s)}% ${round(l)}%`;
    return color.alpha === 1 ? base : `${base} / ${color.alpha.toFixed(2)}`;
}

function formatColorByFormat(color: vscode.Color, format: ColorFormat): string | undefined {
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

function getFormatPriority(original: ColorFormat): ColorFormat[] {
    const priorityMap: Record<ColorFormat, ColorFormat[]> = {
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

function registerLanguageProviders(context: vscode.ExtensionContext) {
    providerSubscriptions.forEach(disposable => disposable.dispose());
    providerSubscriptions = [];

    const config = vscode.workspace.getConfiguration('yavcop');
    const languages = config.get<string[]>('languages', DEFAULT_LANGUAGES);

    if (!languages || languages.length === 0) {
        return;
    }

    let selector: vscode.DocumentSelector;
    if (languages.includes('*')) {
        selector = [
            { scheme: 'file' },
            { scheme: 'untitled' }
        ];
    } else {
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

// Color accessibility utilities
function getRelativeLuminance(color: vscode.Color): number {
    // Convert RGB to relative luminance using WCAG formula
    const rsRGB = color.red;
    const gsRGB = color.green;
    const bsRGB = color.blue;
    
    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(color1: vscode.Color, color2: vscode.Color): number {
    const lum1 = getRelativeLuminance(color1);
    const lum2 = getRelativeLuminance(color2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

function getAccessibilityLevel(ratio: number): { level: string; passes: string[] } {
    const passes: string[] = [];
    if (ratio >= 7) {
        passes.push('AAA (normal)', 'AAA (large)', 'AA (normal)', 'AA (large)');
        return { level: 'AAA', passes };
    } else if (ratio >= 4.5) {
        passes.push('AA (normal)', 'AA (large)', 'AAA (large)');
        return { level: 'AA', passes };
    } else if (ratio >= 3) {
        passes.push('AA (large)');
        return { level: 'AA Large', passes };
    }
    return { level: 'Fail', passes: [] };
}

// Extract unique colors from workspace
function extractWorkspaceColorPalette(): Map<string, vscode.Color> {
    const palette = new Map<string, vscode.Color>();
    
    // Extract from CSS variables
    for (const declarations of cssVariableRegistry.values()) {
        for (const decl of declarations) {
            const resolved = resolveNestedVariables(decl.value);
            const parsed = parseColor(resolved);
            if (parsed) {
                palette.set(parsed.cssString, parsed.vscodeColor);
            }
        }
    }
    
    return palette;
}

// Export selected internals for targeted unit tests.
export const __testing = {
    parseColor,
    getFormatPriority,
    formatColorByFormat,
    collectColorData,
    provideDocumentColors,
    computeColorData,
    ensureColorData,
    getNativeColorRangeKeys,
    registerLanguageProviders,
    shouldDecorate,
    colorDataCache,
    pendingColorComputations
};



