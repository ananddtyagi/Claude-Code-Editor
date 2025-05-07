# Claude Code Extension for VS Code

This extension integrates Claude Code with VS Code, providing a cursor-like interface where you can see changes and either apply or revert them after each command.

## Features

- Chat interface to interact with Claude Code
- View pending changes from Claude Code commands
- Apply or revert changes selectively
- Works with the Claude Code CLI tool

## Requirements

- VS Code 1.60.0 or higher
- Claude Code CLI installed and configured

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile the extension
4. Press F5 to start debugging

## Usage

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette
2. Type "Start Claude Code Session" and select the command
3. A new panel will open with a chat interface
4. Type your commands in the input box and press Enter
5. View the changes suggested by Claude Code
6. Click "Apply" to apply a change or "Revert" to discard it

## How It Works

This extension works by:

1. Capturing the state of your workspace files before running a Claude Code command
2. Running the command via the Claude Code CLI
3. Detecting any changes made to files
4. Temporarily reverting those changes
5. Presenting the changes in the UI for you to selectively apply or discard

## Extension Settings

This extension contributes the following settings:

* `claude-code-extension.binaryExcludePattern`: Pattern to exclude binary files from tracking
* `claude-code-extension.maximumFileSize`: Maximum file size to track (in KB)

## Known Issues

- Large files may cause performance issues
- Binary files are not properly handled

## Release Notes

### 0.0.1

Initial release of Claude Code Extension

---

## Development

### Building the Extension

```bash
npm run compile
```

### Packaging the Extension

```bash
npm run package
```