# Change Log

All notable changes to the "Claude Code Interface" extension will be documented in this file.

## [0.0.2] - 2025-05-16

### Changed
- Simplified extension functionality to create a direct terminal interface
- Instead of running Claude Code as a background process and parsing responses, now creates a dedicated terminal
- Messages typed in the extension UI are sent directly to the terminal
- Users interact with Claude directly in the terminal
- Updated README and documentation to reflect the new approach

## [0.0.1] - 2025-05-15

### Added
- Initial release
- Basic chat interface for Claude Code
- Spawns Claude Code process in the background
- Parses Claude's responses for file changes
- Shows file changes with highlighting