import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { processFileChangesForHighlighting } from './fileService';
import { parseClaudeResponse } from './responseParser';

// Global variables for managing the Claude process and response handling
let claudeProcess: child_process.ChildProcess | undefined;
let inResponseMode: boolean = false;

// Create an output channel for logging
const outputChannel = vscode.window.createOutputChannel('Claude Code Extension');

/**
 * Helper function for logging
 */
function log(message: string) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    console.log(message);
}

/**
 * Handle user queries to Claude Code
 */
export async function handleUserQuery(query: string, panel: vscode.WebviewPanel) {
    // Check if the Claude Code terminal already exists
    // Use startsWith to handle indexed terminals like "Claude Code (1)"
    let terminal = vscode.window.terminals.find(t => t.name.startsWith('Claude Code'));
    
    log(`Terminals found: ${vscode.window.terminals.map(t => t.name).join(', ')}`);
    log(`Found Claude Code terminal: ${terminal ? 'Yes' : 'No'}`);

    // Only create a new terminal if one doesn't exist
    if (!terminal) {
        try {            
            // Show a loading indicator in the webview
            panel.webview.postMessage({ 
                command: 'loadingState', 
                loading: true,
                message: 'Starting Claude Code process...'
            });
            
            // Create a Claude Code terminal instead of spawning a process
            terminal = vscode.window.createTerminal('Claude Code');
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
        
        // We already have a terminal reference from the check at the beginning of this function
        if (terminal) {
            // Focus the terminal
            terminal.show();
            
            // Send the query to the terminal
            terminal.sendText(query);
            
            log(`Query sent to Claude Code terminal: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`);
        } else {
            // This code branch should not be reached due to our earlier check,
            // but kept as a fallback for unexpected cases
            log('Terminal reference lost, creating a new one');
            // This should never happen because of our terminal check above, 
            // but we'll check for all terminals again as a safety measure
            let existingTerminal = vscode.window.terminals.find(t => t.name.startsWith('Claude Code'));
            
            if (existingTerminal) {
                // Use the existing terminal if found
                existingTerminal.show();
                existingTerminal.sendText(query);
            } else {
                // Create a new terminal only if we still don't have one
                const newTerminal = vscode.window.createTerminal('Claude Code');
                newTerminal.show();
                newTerminal.sendText('claude');
                
                // Wait a moment for Claude to start up
                setTimeout(() => {
                    newTerminal.sendText(query);
                }, 2000);
            }
            
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