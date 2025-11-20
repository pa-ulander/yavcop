# ColorBuddy v0.0.1 - Release Notes

**Release Date:** November 20, 2025

We're excited to announce the initial release of **ColorBuddy – Your VS Code Color Companion**! This extension enhances your coding experience by providing intelligent color detection, visualization, and management across your workspace.

## What's New

### Core Features

**Color Detection & Visualization**
- Inline color indicators appear next to recognized color values in your code
- Interactive hover previews with color swatches using SVG data URIs
- Native VS Code color picker integration for quick color editing
- Format preservation - edits maintain your original color notation

**Supported Color Formats**
- **Hex**: `#f00`, `#ff0000`, `#ff0000cc`
- **RGB/RGBA**: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
- **HSL/HSLA**: `hsl(0 100% 50%)`, `hsla(0 100% 50% / 0.5)`
- **Tailwind Compact HSL**: `0 100% 50%`, `0 100% 50% / 0.5`

### CSS Variable Intelligence

**Advanced CSS Variable Support**
- Automatic detection of CSS variables in `:root` and theme-specific selectors
- Context-aware resolution supporting light/dark theme variants
- Nested variable resolution (variables referencing other variables)
- Inline display of resolved values with rich tooltips
- Tooltip shows all theme variants with individual color swatches

### Tailwind CSS Integration

**Smart Tailwind Detection**
- Intelligent recognition of Tailwind utility classes
- Automatic color resolution for Tailwind color classes
- Hover tooltips displaying resolved color values
- Support for Tailwind's compact HSL notation

### CSS Class Color Detection

**Enhanced CSS Class Intelligence**
- Detects CSS classes with color-related properties:
  - `color`
  - `background-color`
  - `border-color`
  - `background`
- Inline color decorations for CSS class names in HTML/JSX
- Rich tooltips showing:
  - Resolved color values
  - CSS property details
  - File locations where classes are defined
- Automatic resolution of CSS variables within class definitions

### Accessibility Features

**WCAG Compliance Tools**
- Built-in WCAG contrast ratio calculations
- Accessibility level indicators displayed in tooltips:
  - **AAA** - Highest level of accessibility
  - **AA** - Standard accessibility level
  - **AA Large** - Accessible for large text
  - **Fail** - Does not meet minimum standards
- Contrast ratios shown against both white and black backgrounds
- Helps ensure your color choices meet accessibility guidelines

### Wide Language Support

**40+ Languages Out of the Box**

The extension works seamlessly across a wide variety of languages and file types:

- **CSS/Styling**: CSS, SCSS, Sass, Less, Stylus, PostCSS
- **Markup**: HTML, XML, SVG
- **JavaScript/TypeScript**: JavaScript, JSX, TypeScript, TSX
- **Modern Frameworks**: Vue, Svelte, Astro
- **Data/Config**: JSON, JSONC, YAML, TOML
- **Markdown**: Markdown, MDX
- **Programming**: Python, Ruby, PHP, Perl, Go, Rust, Java, Kotlin, Swift, C#, C++, C, Objective-C, Dart, Lua
- **Scripting**: Shell Script, PowerShell
- **Query**: SQL, GraphQL
- **Other**: Plain Text

**Fully Customizable**
- Configure language support via the `colorbuddy.languages` setting
- Add or remove languages to fit your workflow
- Use `"*"` to enable color detection in all file types
- Changes apply immediately without reloading

### Commands

Two powerful commands to manage your workspace colors:

- **`ColorBuddy: Re-index CSS Variables`** - Refresh the CSS variable cache to pick up new definitions
- **`ColorBuddy: Show Workspace Color Palette`** - Display all colors found in your workspace

## Getting Started

1. Install ColorBuddy from the VS Code Marketplace
2. Open any supported file type
3. Color indicators will appear automatically next to color values
4. Hover over colors to see detailed information
5. Click on color values to open the native VS Code color picker

## Configuration

Customize which languages ColorBuddy monitors:

```json
{
  "colorbuddy.languages": [
    "css",
    "scss",
    "html",
    "javascript",
    "typescript"
  ]
}
```

## Technical Highlights

- Built with TypeScript for type safety and maintainability
- Webpack bundling for optimized performance
- Comprehensive test suite ensuring reliability
- Efficient caching mechanisms to minimize performance impact
- Smart deduplication to avoid conflicts with VS Code's native color providers

## Requirements

- VS Code version 1.106.1 or higher

## Known Issues

None at this time. Please report any issues on our [GitHub repository](https://github.com/pa-ulander/color-buddy).

## Feedback

We'd love to hear from you! If you have suggestions, feature requests, or encounter any issues, please:
- Open an issue on [GitHub](https://github.com/pa-ulander/color-buddy/issues)
- Leave a review on the VS Code Marketplace

## License

MIT License - See LICENSE file for details

---

**Thank you for using ColorBuddy!** We hope it makes working with colors in VS Code more delightful and productive.
