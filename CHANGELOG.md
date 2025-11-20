# Change Log

All notable changes to the **ColorBuddy** extension will be documented in this file.

## [Unreleased]

### Added
- CSS class color detection and preview support
  - Detects CSS classes with color properties (`color`, `background-color`, `border-color`, `background`)
  - Shows inline color box decorations for CSS class names in code
  - Displays rich tooltips with color swatches, property details, and file locations
- Color swatches in all hover tooltips using SVG data URIs
  - CSS variables show swatches for all theme variants (default, light, dark)
  - Tailwind classes show swatches for resolved colors
  - CSS class colors show swatches for resolved values
  - Literal colors show swatches with format information
- WCAG accessibility information in all tooltips
  - Contrast ratios against white and black backgrounds
  - Accessibility level indicators (AAA, AA, AA Large, Fail)
- Support for CSS variables in CSS class color values
  - Automatically resolves `var(--variable)` references in CSS class definitions
  - Handles nested variable resolution

### Changed
- Improved tooltip formatting and consistency across all color types
- Excluded CSS variables and CSS class colors from color picker (shown in tooltips only)
- Enhanced color detection to include CSS class names in HTML/JSX `class` attributes

## [0.0.1] - 2025-11-20

### Added
- Initial release of **ColorBuddy – Your VS Code Color Companion**
- Core color detection and visualization
  - Inline color indicators for recognized color values
  - Hover previews with color swatches
  - Native VS Code color picker integration
- Support for multiple color formats:
  - Hex colors: `#f00`, `#ff0000`, `#ff0000cc`
  - RGB/RGBA: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
  - HSL/HSLA: `hsl(0 100% 50%)`, `hsla(0 100% 50% / 0.5)`
  - Tailwind compact HSL: `0 100% 50%`, `0 100% 50% / 0.5`
- CSS variable detection and resolution
  - Automatic detection of CSS variables (`:root` and theme variants)
  - Context-aware variable resolution with light/dark theme support
  - Nested variable resolution
  - Inline display of resolved variable values
- Tailwind CSS integration
  - Intelligent detection of Tailwind color classes
  - Color resolution for Tailwind utility classes
  - Hover tooltips with Tailwind color information
- CSS class color detection
  - Detects CSS classes with color properties (`color`, `background-color`, `border-color`, `background`)
  - Shows inline color decorations for CSS class names
  - Rich tooltips with property details and file locations
- Accessibility features
  - WCAG contrast ratio calculations
  - Accessibility level indicators (AAA, AA, AA Large, Fail)
  - Contrast ratios against white and black backgrounds
- Configurable language support
  - Default support for 40+ languages including CSS, HTML, JavaScript, TypeScript, Python, Ruby, PHP, and more
  - Customizable via `colorbuddy.languages` setting
  - Wildcard `"*"` option for all file types
- Commands
  - `ColorBuddy: Re-index CSS Variables` - Refresh CSS variable cache
  - `ColorBuddy: Show Workspace Color Palette` - Display all workspace colors
- Comprehensive test suite
  - Unit tests for color parsing and formatting
  - Integration tests for core functionality

### Technical
- TypeScript-based VS Code extension
- Webpack bundling for optimized distribution
- ESLint configuration for code quality
- Automated testing with @vscode/test-cli
- Source maps for debugging