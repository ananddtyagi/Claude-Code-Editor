import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Simple state management
let terminal: vscode.Terminal | undefined;
let panel: vscode.WebviewPanel | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let initialFileState: Map<string, string> = new Map();

// Activate the extension
export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code Extension is now active');
  
  // Register the command to start a Claude Code session
  let startSessionDisposable = vscode.commands.registerCommand('claude-code-extension.startSession', () => {
    // Create the panel if it doesn't exist
    if (!panel) {
      createPanel(context);
    } else {
      panel.reveal();
    }
    
    // Show a notification that the session has started
    vscode.window.showInformationMessage('Claude Code session started');
  });
  
  context.subscriptions.push(startSessionDisposable);
}

// Create the webview panel
function createPanel(context: vscode.ExtensionContext) {
  // Create the panel
  panel = vscode.window.createWebviewPanel(
    'claudeCode',
    'Claude Code',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  // Set the HTML content
  panel.webview.html = getWebviewContent();
  
  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(message => {
    switch (message.command) {
      case 'startClaudeCode':
        startClaudeCode();
        return;
      case 'sendCommand':
        sendCommandToClaudeCode(message.text);
        return;
      case 'openFile':
        openFile(message.path);
        return;
    }
  });
  
  // Clean up when the panel is closed
  panel.onDidDispose(() => {
    panel = undefined;
    if (terminal) {
      terminal.dispose();
      terminal = undefined;
    }
    if (fileWatcher) {
      fileWatcher.dispose();
      fileWatcher = undefined;
    }
  });
}

// Start Claude Code in a terminal
function startClaudeCode() {
  if (terminal) {
    terminal.dispose();
  }
  
  // Create a new terminal
  terminal = vscode.window.createTerminal('Claude Code');
  terminal.show();
  
  // Run Claude Code - use full path to ensure it works
  terminal.sendText('/usr/local/bin/claude', true);
  
  // Take a snapshot of the current files
  takeFileSnapshot();
  
  // Notify the webview
  if (panel) {
    panel.webview.postMessage({ type: 'claudeCodeStarted' });
  }
}

// Send a command to Claude Code
function sendCommandToClaudeCode(command: string) {
  if (!terminal) {
    vscode.window.showErrorMessage('Claude Code terminal is not initialized');
    return;
  }
  
  // Send the command
  terminal.show();
  terminal.sendText(command, true);
  
  // Check for changes after a delay
  setTimeout(checkForChanges, 3000);
}

// Open a file in the editor
function openFile(filePath: string) {
  const uri = vscode.Uri.file(filePath);
  vscode.workspace.openTextDocument(uri).then(doc => {
    vscode.window.showTextDocument(doc);
  });
}

// Take a snapshot of the current files
function takeFileSnapshot() {
  initialFileState.clear();
  
  // Get all workspace files
  if (vscode.workspace.workspaceFolders) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const files = getFiles(workspaceRoot);
    
    // Store the current content of each file
    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        initialFileState.set(file, content);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    });
  }
}

// Get all files in a directory recursively
function getFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results = results.concat(getFiles(fullPath));
      }
    } else {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Check for changes in files
function checkForChanges() {
  const changes: any[] = [];
  
  // Check each file for changes
  initialFileState.forEach((originalContent, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        const currentContent = fs.readFileSync(filePath, 'utf8');
        
        if (currentContent !== originalContent) {
          changes.push({
            path: filePath,
            fileName: path.basename(filePath),
            oldContent: originalContent,
            newContent: currentContent
          });
        }
      }
    } catch (error) {
      console.error(`Error checking file ${filePath}:`, error);
    }
  });
  
  // Notify the webview of the changes
  if (panel) {
    panel.webview.postMessage({ 
      type: 'fileChanges', 
      changes 
    });
  }
}

// Generate the HTML content for the webview
function getWebviewContent() {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        margin: 0;
        padding: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      .container {
        display: flex;
        flex: 1;
      }
      
      .left-panel {
        flex: 3;
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--vscode-panel-border);
      }
      
      .right-panel {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      }
      
      .chat-container {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      }
      
      .input-container {
        padding: 10px;
        display: flex;
        border-top: 1px solid var(--vscode-panel-border);
      }
      
      input, button {
        font-family: var(--vscode-font-family);
      }
      
      input {
        flex: 1;
        padding: 8px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
      }
      
      button {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 8px 16px;
        margin-left: 8px;
        cursor: pointer;
      }
      
      button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      .message {
        margin-bottom: 10px;
        padding: 8px;
        border-radius: 4px;
      }
      
      .user-message {
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        align-self: flex-end;
      }
      
      .assistant-message {
        background-color: var(--vscode-editor-hoverHighlightBackground);
      }
      
      .file-change {
        margin-bottom: 15px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        overflow: hidden;
      }
      
      .file-header {
        padding: 8px;
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .file-actions {
        display: flex;
        gap: 4px;
      }
      
      .file-actions button {
        padding: 4px 8px;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="left-panel">
        <div class="chat-container" id="chat"></div>
        <div class="input-container">
          <input type="text" id="command-input" placeholder="Type a command..." disabled />
          <button id="send-button" disabled>Send</button>
        </div>
      </div>
      <div class="right-panel">
        <h3>File Changes</h3>
        <button id="start-button">Start Claude Code</button>
        <div id="changes-list"></div>
      </div>
    </div>
    
    <script>
      const vscode = acquireVsCodeApi();
      let claudeCodeRunning = false;
      
      const chat = document.getElementById('chat');
      const commandInput = document.getElementById('command-input');
      const sendButton = document.getElementById('send-button');
      const startButton = document.getElementById('start-button');
      const changesList = document.getElementById('changes-list');
      
      // Event listeners
      startButton.addEventListener('click', startClaudeCode);
      sendButton.addEventListener('click', sendCommand);
      commandInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          sendCommand();
        }
      });
      
      // Start Claude Code
      function startClaudeCode() {
        startButton.disabled = true;
        startButton.textContent = 'Starting...';
        
        addMessage('Starting Claude Code...', 'assistant');
        
        vscode.postMessage({
          command: 'startClaudeCode'
        });
      }
      
      // Send a command to Claude Code
      function sendCommand() {
        const command = commandInput.value.trim();
        
        if (command && claudeCodeRunning) {
          addMessage(command, 'user');
          
          vscode.postMessage({
            command: 'sendCommand',
            text: command
          });
          
          commandInput.value = '';
        }
      }
      
      // Add a message to the chat
      function addMessage(text, sender) {
        const message = document.createElement('div');
        message.className = \`message \${sender}-message\`;
        message.textContent = text;
        
        chat.appendChild(message);
        chat.scrollTop = chat.scrollHeight;
      }
      
      // Update the file changes list
      function updateFileChanges(changes) {
        changesList.innerHTML = '';
        
        if (changes.length === 0) {
          const noChanges = document.createElement('div');
          noChanges.textContent = 'No changes detected';
          noChanges.style.fontStyle = 'italic';
          noChanges.style.color = 'var(--vscode-disabledForeground)';
          noChanges.style.padding = '8px';
          
          changesList.appendChild(noChanges);
          return;
        }
        
        changes.forEach(change => {
          const fileChange = document.createElement('div');
          fileChange.className = 'file-change';
          
          // Create file header
          const fileHeader = document.createElement('div');
          fileHeader.className = 'file-header';
          
          const fileName = document.createElement('div');
          fileName.textContent = change.fileName;
          
          const fileActions = document.createElement('div');
          fileActions.className = 'file-actions';
          
          // Open button
          const openButton = document.createElement('button');
          openButton.textContent = 'Open';
          openButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'openFile',
              path: change.path
            });
          });
          
          fileActions.appendChild(openButton);
          fileHeader.appendChild(fileName);
          fileHeader.appendChild(fileActions);
          fileChange.appendChild(fileHeader);
          
          changesList.appendChild(fileChange);
        });
      }
      
      // Handle messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
          case 'claudeCodeStarted':
            claudeCodeRunning = true;
            startButton.disabled = false;
            startButton.textContent = 'Restart Claude Code';
            commandInput.disabled = false;
            sendButton.disabled = false;
            addMessage('Claude Code is ready. Type a command to continue.', 'assistant');
            break;
            
          case 'fileChanges':
            updateFileChanges(message.changes);
            break;
        }
      });
      
      // Initial message
      addMessage('Welcome to Claude Code. Click "Start Claude Code" to begin.', 'assistant');
    </script>
  </body>
  </html>`;
}

export function deactivate() {
  // Clean up resources
  if (terminal) {
    terminal.dispose();
  }
  
  if (fileWatcher) {
    fileWatcher.dispose();
  }
}