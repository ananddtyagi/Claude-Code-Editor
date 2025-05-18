import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { parseClaudeResponse, ClaudeResponse, FileChange, getChangedLineNumbers } from './responseParser';

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
			message => {
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
						// Get and send workspace files
						getWorkspaceFiles(panel);
						return;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(disposable);
}

// Global variables for managing the Claude process and response handling
let claudeProcess: child_process.ChildProcess | undefined;
let responseBuffer: string = '';
let inResponseMode: boolean = false;
let lastResponseTimestamp: number = 0;
let responseTimeout: NodeJS.Timeout | undefined;
let globalResponseTimeout: NodeJS.Timeout | undefined;

// Create an output channel for logging
const outputChannel = vscode.window.createOutputChannel('Claude Code Extension');

// Helper function for logging
function log(message: string) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    outputChannel.show(true);
    console.log(message);
}

// Store information about file changes for highlighting
const fileChangeMap = new Map<string, { additions: number[], deletions: number[] }>();

// Function to handle user queries to Claude Code
async function handleUserQuery(query: string, panel: vscode.WebviewPanel) {
	// Start Claude Code process if not already running
	if (!claudeProcess) {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const cwd = workspaceFolders ? workspaceFolders[0].uri.fsPath : process.cwd();
			
			// Show a loading indicator in the webview
			panel.webview.postMessage({ 
				command: 'loadingState', 
				loading: true,
				message: 'Starting Claude Code process...'
			});
			
			// Create a Claude Code terminal instead of spawning a process
			const terminal = vscode.window.createTerminal('Claude Code');
			terminal.show();
			
			// Run Claude Code in the terminal
			terminal.sendText('claude');
			
			// Let the user know to use the terminal directly
			panel.webview.postMessage({
				command: 'claudeResponse',
				data: {
					answerText: "Claude Code is now running in a terminal. Use this input field to send messages to Claude.",
					fileChanges: []
				}
			});
			
			// Update UI to show we're ready for input
			panel.webview.postMessage({ 
				command: 'loadingState', 
				loading: false 
			});
			
			// We'll use this flag to indicate that we're using a terminal instead of a process
			inResponseMode = false;
			
		} catch (error) {
			console.error('Failed to start Claude Code terminal:', error);
			panel.webview.postMessage({ 
				command: 'claudeResponse', 
				data: {
					answerText: 'Error: Failed to start Claude Code terminal. Please make sure Claude CLI is installed and in your PATH.',
					fileChanges: []
				}
			});
			panel.webview.postMessage({ 
				command: 'loadingState', 
				loading: false 
			});
			return;
		}
	}
	
	// Send user query to the terminal
	try {
		// Add the user's message to the chat UI
		panel.webview.postMessage({ 
			command: 'userMessage', 
			text: query 
		});
		
		// Find the Claude Code terminal
		const terminal = vscode.window.terminals.find(t => t.name === 'Claude Code');
		
		if (terminal) {
			// Focus the terminal
			terminal.show();
			
			// Send the query to the terminal
			terminal.sendText(query);
			
			log(`Query sent to Claude Code terminal: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`);
		} else {
			// Create a new terminal if it was closed
			const newTerminal = vscode.window.createTerminal('Claude Code');
			newTerminal.show();
			newTerminal.sendText('claude');
			
			// Wait a moment for Claude to start up
			setTimeout(() => {
				newTerminal.sendText(query);
			}, 2000);
			
			log(`Created new Claude Code terminal and sent query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`);
		}
		
	} catch (error) {
		log(`Error sending query to terminal: ${error}`);
		panel.webview.postMessage({ 
			command: 'claudeResponse', 
			data: {
				answerText: "Error: Failed to send message to Claude terminal. Please try again or restart VS Code.",
				fileChanges: []
			}
		});
	}
}

// Function to process Claude's response
function processResponse(response: string, panel: vscode.WebviewPanel) {
	// Log raw response for debugging
	console.log('Raw response to process:', response);

	// Remove any user query echo or prompt characters from the beginning
	const cleanedResponse = response.replace(/^> .*\n/, '');
	
	// Check if the response is empty after cleaning
	if (!cleanedResponse.trim()) {
		console.log('Empty response after cleaning, skipping processing');
		return;
	}
	
	// Parse the response using our parser
	const responseObj = parseClaudeResponse(cleanedResponse);
	
	// Process file changes for highlighting
	processFileChangesForHighlighting(responseObj.fileChanges);
	
	// If no answer text was extracted, provide a fallback message
	if (!responseObj.answerText.trim()) {
		responseObj.answerText = "I received your message, but I'm still processing or there was an issue with the response format.";
	}
	
	// Send the response to the webview
	panel.webview.postMessage({ 
		command: 'claudeResponse', 
		data: responseObj 
	});
	
	// Hide loading indicator
	panel.webview.postMessage({ 
		command: 'loadingState', 
		loading: false 
	});
}

// Process file changes to extract line numbers for highlighting
function processFileChangesForHighlighting(fileChanges: FileChange[]) {
	// Clear the previous file change map
	fileChangeMap.clear();
	
	// Process each file change
	for (const change of fileChanges) {
		const diffText = change.diffLines.join('\n');
		const lineNumbers = getChangedLineNumbers(diffText);
		
		// Store the line numbers for this file
		fileChangeMap.set(change.filePath, {
			additions: lineNumbers.addedLines,
			deletions: lineNumbers.removedLines
		});
	}
}

// Function to get all workspace files and send them to the webview
async function getWorkspaceFiles(panel: vscode.WebviewPanel) {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			panel.webview.postMessage({ 
				command: 'workspaceFiles', 
				files: [] 
			});
			return;
		}
		
		// For each workspace folder, get all files
		const allFiles: string[] = [];
		
		for (const folder of workspaceFolders) {
			const relativePath = folder.uri.fsPath;
			const globPattern = new vscode.RelativePattern(folder, '**/*');
			
			// Exclude node_modules, .git, and other common directories to avoid too many files
			const files = await vscode.workspace.findFiles(
				globPattern, 
				'{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.next/**,**/.cache/**,**/build/**}'
			);
			
			// Add files to the list
			for (const file of files) {
				// Skip directories (we only want files)
				try {
					const stat = await vscode.workspace.fs.stat(file);
					if (stat.type === vscode.FileType.File) {
						allFiles.push(file.fsPath);
					}
				} catch (error) {
					// Skip if we can't get file stats
					continue;
				}
			}
		}
		
		// Sort files by path for easier browsing
		allFiles.sort();
		
		// Send files to webview
		panel.webview.postMessage({ 
			command: 'workspaceFiles', 
			files: allFiles 
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

// Open a file in the editor and highlight changes
async function openFileWithHighlights(filePath: string) {
	try {
		// Open the file in the editor
		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);
		
		// Get the line numbers for this file
		const lineNumbers = fileChangeMap.get(filePath);
		if (lineNumbers) {
			// Create decorations for added lines
			const addedLineDecoration = vscode.window.createTextEditorDecorationType({
				backgroundColor: 'rgba(155, 233, 168, 0.5)',
				isWholeLine: true
			});
			
			// Apply decorations for added lines
			const addedRanges = lineNumbers.additions.map(num => 
				new vscode.Range(Math.max(0, num - 1), 0, Math.max(0, num - 1), 0)
			);
			
			editor.setDecorations(addedLineDecoration, addedRanges);
			
			// If there are added lines, scroll to the first one
			if (addedRanges.length > 0) {
				editor.revealRange(addedRanges[0], vscode.TextEditorRevealType.InCenter);
			}
		}
	} catch (error) {
		console.error('Error opening file:', error);
		vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
	}
}

// Function to get the HTML content for the webview
function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	// Basic HTML content with message area and input box
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Claude Code Chat</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			padding: 0;
			margin: 0;
			color: var(--vscode-editor-foreground);
			background-color: var(--vscode-editor-background);
		}
		
		.container {
			display: flex;
			flex-direction: column;
			height: 100vh;
			padding: 10px;
			box-sizing: border-box;
		}
		
		.messages-container {
			flex: 1;
			overflow-y: auto;
			margin-bottom: 10px;
			padding: 10px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
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
			background-color: var(--vscode-editor-selectionBackground);
			white-space: pre-wrap;
		}
		
		.file-changes {
			margin-top: 10px;
			padding: 8px;
			background-color: var(--vscode-editor-lineHighlightBackground);
			border-radius: 4px;
		}
		
		.file-item {
			margin: 5px 0;
			cursor: pointer;
			color: var(--vscode-textLink-foreground);
		}
		
		.file-item:hover {
			text-decoration: underline;
		}
		
		.input-container {
			display: flex;
			flex-direction: column;
			padding: 10px 0;
		}
		
		.file-selection-area {
			margin-bottom: 10px;
			display: flex;
			flex-direction: column;
		}
		
		.file-selection-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 5px;
		}
		
		.selected-files {
			display: flex;
			flex-wrap: wrap;
			margin-bottom: 8px;
			padding: 5px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			background-color: var(--vscode-editor-background);
			min-height: 30px;
		}
		
		.selected-file-tag {
			display: flex;
			align-items: center;
			background-color: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 4px;
			padding: 2px 6px;
			margin: 2px;
			font-size: 12px;
		}
		
		.selected-file-tag .remove-file {
			margin-left: 5px;
			cursor: pointer;
			font-weight: bold;
		}
		
		.file-selector-toggle {
			display: flex;
			align-items: center;
			cursor: pointer;
			color: var(--vscode-textLink-foreground);
			user-select: none;
		}
		
		.file-selector-controls {
			display: flex;
			align-items: center;
		}
		
		.file-selector-search {
			margin-right: 8px;
			padding: 4px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			color: var(--vscode-input-foreground);
			background-color: var(--vscode-input-background);
		}
		
		.clear-files-btn {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 4px;
			padding: 4px 8px;
			cursor: pointer;
			font-size: 12px;
		}
		
		.clear-files-btn:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.file-selector {
			display: none;
			max-height: 200px;
			overflow-y: auto;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			margin-bottom: 8px;
			padding: 5px;
			background-color: var(--vscode-dropdown-background);
		}
		
		.file-selector.visible {
			display: block;
		}
		
		.file-checkbox-item {
			display: flex;
			align-items: center;
			padding: 3px 5px;
			cursor: pointer;
			border-radius: 3px;
		}
		
		.file-checkbox-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		
		.file-checkbox-item input {
			margin-right: 8px;
		}
		
		.file-path {
			font-size: 12px;
			word-break: break-all;
		}
		
		.input-row {
			display: flex;
		}
		
		#userInput {
			flex: 1;
			padding: 8px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			color: var(--vscode-input-foreground);
			background-color: var(--vscode-input-background);
		}
		
		#sendButton {
			margin-left: 10px;
			padding: 8px 15px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}
		
		#sendButton:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.loading-indicator {
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 10px 0;
			padding: 8px;
			background-color: var(--vscode-editorWidget-background);
			border-radius: 4px;
		}
		
		.spinner {
			width: 20px;
			height: 20px;
			border: 3px solid rgba(0, 0, 0, 0.1);
			border-radius: 50%;
			border-top-color: var(--vscode-progressBar-background);
			animation: spin 1s ease-in-out infinite;
			margin-right: 10px;
		}
		
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		
		.file-diff {
			margin-top: 5px;
			padding: 5px;
			font-family: monospace;
			font-size: 12px;
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-editorWidget-border);
			border-radius: 3px;
			max-height: 200px;
			overflow-y: auto;
			display: none;
		}
		
		.file-diff-line {
			white-space: pre;
		}
		
		.file-diff-line-added {
			background-color: rgba(155, 233, 168, 0.3);
		}
		
		.file-diff-line-removed {
			background-color: rgba(255, 128, 128, 0.3);
			text-decoration: line-through;
		}
		
		.toggle-diff {
			color: var(--vscode-textLink-foreground);
			cursor: pointer;
			font-size: 12px;
			margin-left: 10px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="messages-container" id="messagesContainer">
			<div class="message assistant-message">
				Hello! I'm Claude Code. How can I help you with your code today?
			</div>
		</div>
		<div class="input-container">
			<div class="file-selection-area">
				<div class="file-selection-header">
					<div class="file-selector-toggle" id="fileSelectorToggle">
						<span>📁 Add files as context</span>
					</div>
					<div class="file-selector-controls">
						<input 
							type="text" 
							class="file-selector-search" 
							id="fileSearch" 
							placeholder="Search files..."
							style="display: none;">
						<button 
							class="clear-files-btn" 
							id="clearFilesBtn"
							style="display: none;">
							Clear All
						</button>
					</div>
				</div>
				<div class="selected-files" id="selectedFiles"></div>
				<div class="file-selector" id="fileSelector"></div>
			</div>
			<div class="input-row">
				<input type="text" id="userInput" placeholder="Type your question or request...">
				<button id="sendButton">Send</button>
			</div>
		</div>
	</div>

	<script>
		// Get VS Code API
		const vscode = acquireVsCodeApi();
		
		// Elements
		const messagesContainer = document.getElementById('messagesContainer');
		const userInput = document.getElementById('userInput');
		const sendButton = document.getElementById('sendButton');
		const fileSelectorToggle = document.getElementById('fileSelectorToggle');
		const fileSelector = document.getElementById('fileSelector');
		const selectedFiles = document.getElementById('selectedFiles');
		const fileSearch = document.getElementById('fileSearch');
		const clearFilesBtn = document.getElementById('clearFilesBtn');
		
		// State
		let isLoading = false;
		let loadingIndicator = null;
		let workspaceFiles = [];
		let selectedFilesPaths = [];
		
		// Request workspace files from the extension
		vscode.postMessage({
			command: 'getWorkspaceFiles'
		});
		
		// Toggle file selector visibility
		fileSelectorToggle.addEventListener('click', () => {
			const isVisible = fileSelector.classList.toggle('visible');
			
			// Show/hide search and clear button based on visibility
			fileSearch.style.display = isVisible ? 'block' : 'none';
			clearFilesBtn.style.display = isVisible ? 'block' : 'none';
		});
		
		// Clear all selected files
		clearFilesBtn.addEventListener('click', () => {
			selectedFilesPaths = [];
			updateSelectedFilesUI();
			
			// Uncheck all checkboxes in the file selector
			const checkboxes = fileSelector.querySelectorAll('input[type="checkbox"]');
			checkboxes.forEach(checkbox => {
				checkbox.checked = false;
			});
		});
		
		// Filter files based on search input
		fileSearch.addEventListener('input', () => {
			const searchTerm = fileSearch.value.toLowerCase();
			updateFileSelector(searchTerm);
		});
		
		// Send message function
		function sendMessage() {
			const userQuery = userInput.value.trim();
			if (userQuery && !isLoading) {
				// Prepare the message with context files if any
				let finalMessage = userQuery;
				
				// Prepend selected files as context if any are selected
				if (selectedFilesPaths.length > 0) {
					finalMessage = \`use the following files as context: \${selectedFilesPaths.join(', ')} \${userQuery}\`;
				}
				
				// Clear input
				userInput.value = '';
				
				// Send message to extension
				vscode.postMessage({
					command: 'userQuery',
					text: finalMessage
				});
			}
		}
		
		// Event listeners
		sendButton.addEventListener('click', sendMessage);
		userInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				sendMessage();
			}
		});
		
		// Function to update the file selector UI
		function updateFileSelector(searchTerm = '') {
			fileSelector.innerHTML = '';
			
			// Filter files based on search term
			const filteredFiles = searchTerm 
				? workspaceFiles.filter(file => file.toLowerCase().includes(searchTerm.toLowerCase()))
				: workspaceFiles;
			
			// Add files to selector
			filteredFiles.forEach(file => {
				const item = document.createElement('label');
				item.className = 'file-checkbox-item';
				
				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.value = file;
				checkbox.checked = selectedFilesPaths.includes(file);
				
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						// Add file to selected files if not already included
						if (!selectedFilesPaths.includes(file)) {
							selectedFilesPaths.push(file);
						}
					} else {
						// Remove file from selected files
						const index = selectedFilesPaths.indexOf(file);
						if (index !== -1) {
							selectedFilesPaths.splice(index, 1);
						}
					}
					updateSelectedFilesUI();
				});
				
				const filePathSpan = document.createElement('span');
				filePathSpan.className = 'file-path';
				filePathSpan.textContent = file;
				
				item.appendChild(checkbox);
				item.appendChild(filePathSpan);
				fileSelector.appendChild(item);
			});
		}
		
		// Function to update the selected files UI
		function updateSelectedFilesUI() {
			selectedFiles.innerHTML = '';
			
			if (selectedFilesPaths.length === 0) {
				selectedFiles.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-style: italic; padding: 5px;">No files selected</div>';
				return;
			}
			
			selectedFilesPaths.forEach(file => {
				const tag = document.createElement('div');
				tag.className = 'selected-file-tag';
				
				// Get just the filename (not the full path) for display
				const fileName = file.split('/').pop();
				
				const nameSpan = document.createElement('span');
				nameSpan.textContent = fileName;
				nameSpan.title = file; // Show full path on hover
				
				const removeBtn = document.createElement('span');
				removeBtn.className = 'remove-file';
				removeBtn.textContent = '×';
				removeBtn.title = 'Remove file';
				removeBtn.addEventListener('click', () => {
					const index = selectedFilesPaths.indexOf(file);
					if (index !== -1) {
						selectedFilesPaths.splice(index, 1);
						updateSelectedFilesUI();
						updateFileSelector(fileSearch.value);
					}
				});
				
				tag.appendChild(nameSpan);
				tag.appendChild(removeBtn);
				selectedFiles.appendChild(tag);
			});
		}
		
		// Listen for messages from the extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'workspaceFiles':
					// Update the files list
					workspaceFiles = message.files;
					updateFileSelector();
					updateSelectedFilesUI();
					break;
					
				case 'userMessage':
					// Add user message to the chat
					addMessage(message.text, 'user');
					break;
					
				case 'claudeResponse':
					// Add Claude's response to the chat
					addResponseMessage(message.data);
					break;
					
				case 'loadingState':
					// Update loading state
					updateLoadingState(message.loading, message.message);
					break;
			}
		});
		
		// Function to update loading state
		function updateLoadingState(loading, message = 'Loading...') {
			isLoading = loading;
			
			// Remove existing loading indicator if any
			if (loadingIndicator) {
				messagesContainer.removeChild(loadingIndicator);
				loadingIndicator = null;
			}
			
			// Add new loading indicator if loading
			if (loading) {
				loadingIndicator = document.createElement('div');
				loadingIndicator.className = 'loading-indicator';
				
				const spinner = document.createElement('div');
				spinner.className = 'spinner';
				loadingIndicator.appendChild(spinner);
				
				const text = document.createElement('span');
				text.textContent = message;
				loadingIndicator.appendChild(text);
				
				messagesContainer.appendChild(loadingIndicator);
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}
		
		// Function to add a message to the chat
		function addMessage(text, sender) {
			const messageDiv = document.createElement('div');
			messageDiv.className = \`message \${sender}-message\`;
			messageDiv.textContent = text;
			messagesContainer.appendChild(messageDiv);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
		
		// Function to add Claude's response to the chat
		function addResponseMessage(responseData) {
			// Add the answer text
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message assistant-message';
			messageDiv.textContent = responseData.answerText;
			messagesContainer.appendChild(messageDiv);
			
			// Add file changes if any
			if (responseData.fileChanges && responseData.fileChanges.length > 0) {
				const fileChangesDiv = document.createElement('div');
				fileChangesDiv.className = 'file-changes';
				
				const fileChangesTitle = document.createElement('h4');
				fileChangesTitle.textContent = 'Modified Files:';
				fileChangesDiv.appendChild(fileChangesTitle);
				
				// Add each file change
				responseData.fileChanges.forEach(fileChange => {
					const fileItemContainer = document.createElement('div');
					
					// Create the file item link
					const fileItem = document.createElement('div');
					fileItem.className = 'file-item';
					
					// File name with stats
					const fileStats = document.createElement('span');
					fileStats.textContent = \`\${fileChange.filePath} (+\${fileChange.additions}, -\${fileChange.deletions})\`;
					fileItem.appendChild(fileStats);
					
					// Toggle to show/hide diff
					const toggleDiff = document.createElement('span');
					toggleDiff.className = 'toggle-diff';
					toggleDiff.textContent = 'Show diff';
					fileItem.appendChild(toggleDiff);
					
					// Create diff container
					const diffContainer = document.createElement('div');
					diffContainer.className = 'file-diff';
					
					// Add diff lines
					fileChange.diffLines.forEach(line => {
						const diffLine = document.createElement('div');
						diffLine.className = 'file-diff-line';
						
						// Color added/removed lines
						if (line.startsWith('+')) {
							diffLine.className += ' file-diff-line-added';
						} else if (line.startsWith('-')) {
							diffLine.className += ' file-diff-line-removed';
						}
						
						diffLine.textContent = line;
						diffContainer.appendChild(diffLine);
					});
					
					// Add click event to toggle diff
					toggleDiff.addEventListener('click', (e) => {
						e.stopPropagation(); // Don't trigger the file open
						
						if (diffContainer.style.display === 'block') {
							diffContainer.style.display = 'none';
							toggleDiff.textContent = 'Show diff';
						} else {
							diffContainer.style.display = 'block';
							toggleDiff.textContent = 'Hide diff';
						}
					});
					
					// Add click event to open the file
					fileItem.addEventListener('click', () => {
						vscode.postMessage({
							command: 'openFile',
							file: fileChange.filePath
						});
					});
					
					fileItemContainer.appendChild(fileItem);
					fileItemContainer.appendChild(diffContainer);
					fileChangesDiv.appendChild(fileItemContainer);
				});
				
				messagesContainer.appendChild(fileChangesDiv);
			}
			
			// Scroll to bottom
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
		
		// Initialize UI
		updateSelectedFilesUI();
	</script>
</body>
</html>`;
}

export function deactivate() {
	// Clean up Claude Code process if it's running
	if (claudeProcess) {
		claudeProcess.kill();
		claudeProcess = undefined;
	}
}