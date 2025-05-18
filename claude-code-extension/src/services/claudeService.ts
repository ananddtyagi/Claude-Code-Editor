import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { processFileChangesForHighlighting } from './fileService';
import { parseClaudeResponse } from './responseParser';
import { ClaudeResponse } from '../models/types';

// Global variables for managing the Claude process and response handling
let claudeProcess: child_process.ChildProcess | undefined;
let responseBuffer: string = '';
let inResponseMode: boolean = false;
let lastResponseTimestamp: number = 0;
let responseTimeout: NodeJS.Timeout | undefined;
let globalResponseTimeout: NodeJS.Timeout | undefined;

// Create an output channel for logging
const outputChannel = vscode.window.createOutputChannel('Claude Code Extension');

/**
 * Helper function for logging
 */
function log(message: string) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    outputChannel.show(true);
    console.log(message);
}

/**
 * Handle user queries to Claude Code
 */
export async function handleUserQuery(query: string, panel: vscode.WebviewPanel) {
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

/**
 * Process Claude's response
 */
export function processResponse(response: string, panel: vscode.WebviewPanel) {
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

/**
 * Clean up Claude Code process
 */
export function cleanupClaudeProcess() {
    if (claudeProcess) {
        claudeProcess.kill();
        claudeProcess = undefined;
    }
}