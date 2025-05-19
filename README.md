# Claude Code Interface for VS Code

A Visual Studio Code extension that provides a chat-style interface to Claude Code, allowing you to interact with Claude directly within VS Code. 

## Features

- Chat with Claude Code directly within VS Code
- Send messages to Claude through a convenient interface
- Interact with Claude in a dedicated terminal
- File context selection to help Claude understand your codebase
- Search and select specific files to provide as context
- Simple, lightweight design with minimal dependencies

![Screen Recording May 19 2025](https://github.com/user-attachments/assets/a6a49cad-f845-4f08-be71-cb3b7a4eb8b2)


## Requirements

- [Claude Code CLI](https://github.com/anthropics/claude-code) must be installed and authenticated
- Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- Run `claude login` to authenticate

## Installation

1. Install the extension from the [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=AnandTyagi.claude-code-editor)
2. Or install manually from the VSIX file: [Open VSX Page](https://open-vsx.org/extension/AnandTyagi/claude-code-editor)
   - Download the `.vsix` file
   - In VS Code, go to Extensions view
   - Click the "..." menu (ellipsis) and select "Install from VSIX"
   - Choose the downloaded file

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Open Claude Code Chat" and select the command
3. A chat panel will open and a terminal will be created where Claude Code runs
4. (Optional) Click "Add files as context" to select relevant files for Claude
   - Search for specific files using the search box
   - Check the boxes next to files you want to include
   - Selected files will appear as tags above the input field
   - Remove individual files by clicking the × on the tag
   - Clear all selected files with the "Clear All" button
5. Type your request in the input field and click Send
6. Your message with the selected files as context will be sent to the Claude Code terminal
7. View Claude's responses directly in the terminal

## How It Works

This extension:
1. Creates a dedicated terminal and starts Claude Code
2. Provides a convenient input panel to send messages
3. Forwards your messages to the Claude Code terminal
4. Allows you to see Claude's responses in the terminal window

## Extension Marketplace Display Information

**Claude Code Interface**

*A lightweight VS Code extension that creates an interface for Claude Code with file context support*

This extension provides a convenient interface to interact with Claude Code directly within VS Code. It allows you to send messages to Claude through a chat panel and view responses in a dedicated terminal. You can also select files from your workspace to provide as context, helping Claude better understand your codebase.

**Categories:** AI, Productivity, Other

**Keywords:** claude, ai, code, assistant

## Troubleshooting

- If Claude Code is not installed, the extension will show an error message
- Ensure Claude Code is installed globally with npm and is accessible in your PATH
- Ensure you've run `claude login` to authenticate
- Check the developer console (Help > Toggle Developer Tools) for more detailed error messages

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to contribute to this project.

## License

This extension is licensed under the MIT License.

Created by [Anand Tyagi](https://github.com/anandtyagi) 🤝 Claude Code
