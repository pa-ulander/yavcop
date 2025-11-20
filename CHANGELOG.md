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

## [0.0.1]

- Branded the project as **ColorBuddy – Your VS Code Color Companion**
- Added configurable language support via `colorbuddy.languages`
- Added inline color indicators and hover previews for detected color values
- Enabled VS Code color picker integration for hex, rgb/rgba, hsl/hsla, and Tailwind compact HSL formats across supported documents