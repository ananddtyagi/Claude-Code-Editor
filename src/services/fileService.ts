import * as vscode from 'vscode';
import { LineChanges, FileChange } from '../models/types';

// Map to store file change information for highlighting
const fileChangeMap = new Map<string, { additions: number[], deletions: number[] }>();

/**
 * Process file changes to extract line numbers for highlighting
 */
export function processFileChangesForHighlighting(fileChanges: FileChange[]): void {
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

/**
 * Get all workspace files and return them as an array of file paths
 */
export async function getWorkspaceFiles(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return [];
    }
    
    // For each workspace folder, get all files
    const allFiles: string[] = [];
    
    for (const folder of workspaceFolders) {
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
    return allFiles.sort();
}

/**
 * Open a file in the editor and highlight changes
 */
export async function openFileWithHighlights(filePath: string): Promise<void> {
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

/**
 * Extract changed line numbers from diff
 */
export function getChangedLineNumbers(diffText: string): LineChanges {
    // Import from responseParser to avoid circular dependency
    const responseParser = require('./responseParser');
    return responseParser.getChangedLineNumbers(diffText);
}