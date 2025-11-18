![](https://ghvc.kabelkultur.se?username=pa-ulander&label=Repository%20visits&color=brightgreen&style=flat&repository=yavcop)

# YAVCOP - yet-another-vscode-color-picker

Adds a color indicator and color picker to any dockument, such as:
* css (also Tailwind CSS custom properties) 
* scss, sass, html, js, md ...and so on.  
Add or remove languages in config.

Basically adds a color indicator and a mouseover colorpicker anywhere a common color code is found in text or code, as long as the filetype is included in the config.

## Features

- **Inline color indicator** right beside each detected color value
- **Mouseover preview** that shows the selected color and instructions
- **Native VS Code color picker** available on click for supported values
- **Configurable language support** via the `yavcop.languages` setting
- **Tailwind compact HSL support** in addition to hex, rgb/rgba, and hsl/hsla

## Usage

1. Open any file in a language covered by `yavcop.languages` (defaults include CSS, HTML, JS/TS, Markdown, and more)
2. Look for the inline color indicator next to recognized color codes
3. Click the color value (or use the hover link) to launch VS Code's color picker
4. Choose a new color; YAVCOP keeps the original format when possible

## Supported Color Formats

- Hex: `#f00`, `#ff0000`, `#ff0000cc`
- RGB / RGBA: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
- HSL / HSLA: `hsl(0 100% 50%)`, `hsla(0 100% 50% / 0.5)`
- Tailwind compact HSL: `0 100% 50%`, `0 100% 50% / 0.5`

## Configuration

- `yavcop.languages`: array of VS Code language identifiers that YAVCOP should scan. Edit it from the Settings UI or add to your `settings.json`:

```json
"yavcop.languages": [
  "css",
  "scss",
  "sass",
  "html",
  "markdown"
]
```

Add or remove identifiers to fit your workspace. Changes apply immediately.

## Requirements

VS Code 1.106.1 or higher

## License

MIT

