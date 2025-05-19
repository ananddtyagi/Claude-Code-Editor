import parseDiff from 'parse-diff';
import { ClaudeResponse, FileChange, LineChanges } from '../models/types';

// Parse the Claude Code response
export function parseClaudeResponse(responseText: string): ClaudeResponse {
    // Initialize the response object
    const response: ClaudeResponse = {
        answerText: '',
        fileChanges: []
    };

    // Split the response into lines
    const lines = responseText.split('\n');
    
    let currentText = '';
    let currentFileChange: FileChange | null = null;
    let collectingDiff = false;
    let fileChangesStarted = false;

    // Process each line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line indicates a file change
        if (line.includes('⎿ Updated') || line.includes('● Call(') || line.includes('⏺ Call(')) {
            fileChangesStarted = true;
            
            // If we were collecting a diff, add it to the file changes
            if (currentFileChange) {
                response.fileChanges.push(currentFileChange);
            }
            
            // Extract file path and change stats
            const filePath = extractFilePath(line);
            const { additions, deletions } = extractChangeStats(line);
            
            // Create a new file change object
            currentFileChange = {
                filePath,
                additions,
                deletions,
                diffLines: []
            };
            
            collectingDiff = true;
            continue;
        }
        
        // If we're collecting a diff, add the line to the current file change
        if (collectingDiff && currentFileChange) {
            // We'll collect all lines until we find another file change marker
            // or until the end of the response
            currentFileChange.diffLines.push(line);
        } else if (!fileChangesStarted) {
            // If we haven't started collecting file changes yet, add the line to the answer text
            currentText += line + '\n';
        }
    }
    
    // Add the last file change if there is one
    if (currentFileChange) {
        response.fileChanges.push(currentFileChange);
    }
    
    // Set the answer text
    response.answerText = currentText.trim();
    
    return response;
}

// Helper function to extract file path from a file change line
function extractFilePath(line: string): string {
    // Extract file path from "⎿ Updated <file> with X additions and Y removals"
    const updatedMatch = line.match(/⎿ Updated (.*?) with/);
    if (updatedMatch) {
        return updatedMatch[1];
    }
    
    // Extract file path from "● Call(Edit, file_path=<file>, ...)"
    const callMatch = line.match(/Call\(Edit, file_path=([^,]+)/);
    if (callMatch) {
        return callMatch[1].trim().replace(/['"]/g, '');
    }
    
    // Default to unknown if we can't extract the path
    return 'unknown';
}

// Helper function to extract addition and deletion counts from a file change line
function extractChangeStats(line: string): { additions: number, deletions: number } {
    // Extract stats from "⎿ Updated <file> with X additions and Y removals"
    const statsMatch = line.match(/with (\d+) additions? and (\d+) removals?/);
    if (statsMatch) {
        return {
            additions: parseInt(statsMatch[1], 10),
            deletions: parseInt(statsMatch[2], 10)
        };
    }
    
    // Default to 0 if we can't extract the stats
    return {
        additions: 0,
        deletions: 0
    };
}

// Transform Claude's diff output to a format that can be parsed by the diff parser
export function transformToUnifiedDiff(diffLines: string[]): string {
    // TODO: Implement transformation logic
    // This is a placeholder for now
    return diffLines.join('\n');
}

// Get the line numbers for added/removed lines from a parsed diff
export function getChangedLineNumbers(diffOutput: string): LineChanges {
    const result: LineChanges = {
        addedLines: [],
        removedLines: []
    };
    
    try {
        // Parse the diff
        const files = parseDiff(diffOutput);
        
        // Process each file
        for (const file of files) {
            // Process each chunk in the file
            for (const chunk of file.chunks) {
                // Process each change in the chunk
                for (const change of chunk.changes) {
                    if (change.type === 'add') {
                        result.addedLines.push(change.ln);
                    } else if (change.type === 'del') {
                        result.removedLines.push(change.ln);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error parsing diff:', error);
        
        // Fallback to simple line-by-line parser if parse-diff fails
        const lines = diffOutput.split('\n');
        let currentLineNumber = 0;
        
        for (const line of lines) {
            if (line.startsWith('+')) {
                // Simple added line
                currentLineNumber++;
                result.addedLines.push(currentLineNumber);
            } else if (line.startsWith('-')) {
                // Simple removed line
                result.removedLines.push(currentLineNumber + 1);
            } else if (!line.startsWith('+') && !line.startsWith('-') && line.trim() !== '') {
                // Context line
                currentLineNumber++;
            }
        }
    }
    
    return result;
}