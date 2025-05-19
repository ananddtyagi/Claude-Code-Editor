import * as vscode from 'vscode';
import { getWebviewContent } from './ui/webviewContent';
import { WebviewMessage } from './models/types';
import { getWorkspaceFiles, openFileWithHighlights } from './services/fileService';
import { handleUserQuery, cleanupClaudeProcess } from './services/claudeService';

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Code extension is now active!');

    // Create a status bar item for quick access to the chat panel
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(comment) Claude Code";
    statusBarItem.command = 'claude-code-extension.openChat';
    statusBarItem.tooltip = 'Open Claude Code Chat Panel';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the command to open the Claude Chat panel
    let disposable = vscode.commands.registerCommand('claude-code-extension.openChat', () => {
        // Create a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'claudeChat', // Panel type
            'Claude Code Chat', // Panel title
            vscode.ViewColumn.Beside, // Open panel in the side
            {
                enableScripts: true, // Enable JavaScript in the webview
                retainContextWhenHidden: true, // Keep the webview content when hidden
            }
        );

        // Set the HTML content for the webview
        panel.webview.html = getWebviewContent(panel.webview, context);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                switch (message.command) {
                    case 'userQuery':
                        // Handle user query
                        handleUserQuery(message.text, panel);
                        return;
                    case 'openFile':
                        // Open file in editor
                        openFileWithHighlights(message.file);
                        return;
                    case 'getWorkspaceFiles':
                        // Get workspace files and send them to the webview
                        handleGetWorkspaceFiles(panel);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

/**
 * Handler for the getWorkspaceFiles command from the webview
 */
async function handleGetWorkspaceFiles(panel: vscode.WebviewPanel) {
    try {
        const files = await getWorkspaceFiles();
        panel.webview.postMessage({ 
            command: 'workspaceFiles', 
            files: files 
        });
    } catch (error) {
        console.error('Error getting workspace files:', error);
        // Send empty list in case of error
        panel.webview.postMessage({ 
            command: 'workspaceFiles', 
            files: [] 
        });
    }
}

/**
 * Deactivate the extension
 */
export function deactivate() {
    // Clean up Claude Code process
    cleanupClaudeProcess();
}