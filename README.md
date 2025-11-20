[![Tests](https://github.com/pa-ulander/yavcop/actions/workflows/tests.yml/badge.svg)](https://github.com/pa-ulander/yavcop/actions/workflows/tests.yml) ![](https://ghvc.kabelkultur.se?username=pa-ulander&label=Repository%20visits&color=brightgreen&style=flat&repository=yavcop)

## ColorBuddy - Makes color management suck less

Adds a color indicator and mouseover information anywhere a common color code is found in text or code. Makes color management suck less.

## Features

*   **Inline color indicator** right beside each detected color value
*   **Mouseover preview** that shows the selected color and instructions
*   **Native VS Code color picker** available on click for supported values
*   **Configurable language support** via the `yavcop.languages` setting
*   **Tailwind compact HSL support** in addition to hex, rgb/rgba, and hsl/hsla

<img src="https://github.com/pa-ulander/yavcop/blob/main/img/color-preview.png" width="50%" /><img src="https://github.com/pa-ulander/yavcop/blob/main/img/tailwind-color-class-preview.png" width="50%" />

## Usage

1.  Open any file in a language covered by `yavcop.languages` (defaults include CSS, HTML, JS/TS, Markdown, and more)
2.  Look for the inline color indicator next to recognized color codes
3.  Click the color value (or use the hover link) to launch VS Code's color picker
4.  Choose a new color; YAVCOP keeps the original format when possible

## Supported Color Formats

*   Hex: `#f00`, `#ff0000`, `#ff0000cc`
*   RGB / RGBA: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
*   HSL / HSLA: `hsl(0 100% 50%)`, `hsla(0 100% 50% / 0.5)`
*   Tailwind compact HSL: `0 100% 50%`, `0 100% 50% / 0.5`

## Configuration

*   `yavcop.languages`: array of VS Code language identifiers that YAVCOP should scan. Edit it from the Settings UI or add to your `settings.json`:

```
"yavcop.languages": [
  "css",
  "scss",
  "sass",
  "html",
  "markdown"
]
```

**Default languages include:**

*   **CSS/Styling**: `css`, `scss`, `sass`, `less`, `stylus`, `postcss`
*   **Markup**: `html`, `xml`, `svg`
*   **JavaScript/TypeScript**: `javascript`, `javascriptreact`, `typescript`, `typescriptreact`
*   **Modern Frameworks**: `vue`, `svelte`, `astro`
*   **Data/Config**: `json`, `jsonc`, `yaml`, `toml`
*   **Markdown**: `markdown`, `mdx`
*   **Programming Languages**: `python`, `ruby`, `php`, `perl`, `go`, `rust`, `java`, `kotlin`, `swift`, `csharp`, `cpp`, `c`, `objective-c`, `dart`, `lua`
*   **Scripting**: `shellscript`, `powershell`
*   **Query Languages**: `sql`, `graphql`
*   **Other**: `plaintext`

Add or remove identifiers to fit your workspace. Use `"*"` to enable color detection in all file types. Changes apply immediately.

## Installation

This extension is a work in progress, and it is not yet on the VS Code Marketplace.  
To install it manually:

1.  Download [yavcop-0.0.1.vsix](yavcop-0.0.1.vsix) or run `npm run package` to generate your own.
2.  In VS Code press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and choose `Extensions: Install from VSIX...`.
3.  Pick the downloaded/generated `.vsix` file and reload the editor when prompted.
4.  Alternatively, install via CLI with `code --install-extension yavcop-0.0.1.vsix`.

## Requirements

VS Code 1.106.1 or higher

## License

MIT