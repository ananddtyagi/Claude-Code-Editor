# Contributing to Claude Code Interface for VS Code

Thank you for your interest in contributing to the Claude Code Interface for VS Code! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

Please be respectful and considerate of others when contributing to this project. We expect all contributors to follow basic open source etiquette:

- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community and the project

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** to your local machine
3. **Set up the development environment**:
   ```bash
   npm install
   ```
4. **Build the extension**:
   ```bash
   npm run webpack
   ```

## Development Workflow

1. **Create a new branch** for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b fix/issue-you-are-fixing
   ```

2. **Make your changes** and ensure they follow the project's code style

3. **Test your changes**:
   - Press F5 in VS Code to launch a new window with your extension loaded
   - Use the "Open Claude Code Chat" command to test your changes
   - Make sure Claude Code CLI is installed and authenticated

4. **Build the extension**:
   ```bash
   npm run webpack
   ```

5. **Lint your code**:
   ```bash
   npm run lint
   ```

6. **Commit your changes** with a clear and descriptive commit message

7. **Push your branch** to your fork

8. **Create a pull request** to the main repository's main branch

## Pull Request Guidelines

When submitting a pull request:

1. **Include a clear description** of the changes and why they're needed
2. **Link to any related issues** by using GitHub's issue linking syntax (#issue-number)
3. **Ensure all tests pass** and the extension builds successfully
4. **Keep your PR up-to-date** with the main branch
5. **Be responsive to feedback** and be willing to make changes if requested

## Feature Requests and Bug Reports

- **Feature requests**: Open an issue describing the feature you'd like to see implemented
- **Bug reports**: Open an issue with a clear description of the bug, steps to reproduce, and expected vs. actual behavior

## Project Structure

- `src/`: TypeScript source files
  - `extension.ts`: Main extension entry point
  - `services/`: Helper services for the extension
  - `ui/`: UI-related code and webview content
  - `models/`: Type definitions and interfaces
- `dist/`: Compiled JavaScript files (generated)
- `media/`: Static assets like images
- `.vsix` files: Packaged extensions for distribution

## Testing

Currently, the project relies on manual testing by running the extension in a development instance of VS Code.

To test:
1. Press F5 in VS Code to launch a new window with your extension loaded
2. Use the "Open Claude Code Chat" command
3. Test your changes

## Packaging

To create a VSIX package for distribution:

```bash
npm run package
```

## Need Help?

If you need help or have questions, open an issue or reach out to the maintainers.

Thank you for contributing to Claude Code Interface for VS Code!