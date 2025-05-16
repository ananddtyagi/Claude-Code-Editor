# Claude Code Interface for VS Code

A Visual Studio Code extension that provides a chat-style interface to Claude Code, allowing you to interact with Claude directly within VS Code.

## Features

- Chat with Claude Code directly within VS Code
- Send messages to Claude through a convenient interface
- Interact with Claude in a dedicated terminal
- Simple, lightweight design with minimal dependencies

## Requirements

- [Claude Code CLI](https://github.com/anthropics/claude-code) must be installed and authenticated
- Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- Run `claude login` to authenticate

## Installation

1. Install the extension from the VS Code marketplace
2. Or install manually from the VSIX file:
   - Download the `.vsix` file
   - In VS Code, go to Extensions view
   - Click the "..." menu (ellipsis) and select "Install from VSIX"
   - Choose the downloaded file

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Open Claude Code Chat" and select the command
3. A chat panel will open and a terminal will be created where Claude Code runs
4. Type your request in the input field and click Send
5. Your message will be sent to the Claude Code terminal
6. View Claude's responses directly in the terminal

## How It Works

This extension:
1. Creates a dedicated terminal and starts Claude Code
2. Provides a convenient input panel to send messages
3. Forwards your messages to the Claude Code terminal
4. Allows you to see Claude's responses in the terminal window

## Troubleshooting

- If Claude Code is not installed, the extension will show an error message
- Ensure Claude Code is installed globally with npm and is accessible in your PATH
- Ensure you've run `claude login` to authenticate
- Check the developer console (Help > Toggle Developer Tools) for more detailed error messages

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues on the GitHub repository.

## License

This extension is licensed under the MIT License.