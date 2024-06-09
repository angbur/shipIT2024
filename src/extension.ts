import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

let extensionSettings = {
    apiBaseUrl: 'http://localhost:11434/api/generate',
    apiKey: '',
    model: 'llama3'
};

type Message = {
    role: 'user' | 'assistant';
    content: string;
};
let panel: vscode.WebviewPanel;
let GlobalconversationHistory: Message[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('Your extension "my-gpt-extension" is now active!');
    if (panel) {
        panel.dispose();
    }
    let disposable1 = vscode.commands.registerCommand('gptint.interactWithGPT', async () => {
        const conversationHistory: Message[] = [
            { role: 'user', content: 'Hello, who are you?' }
        ];

        let lastUserMessage = '';

        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            if (conversationHistory[i].role === 'user') {
                lastUserMessage = conversationHistory[i].content;
                break;
            }
        }

        try {
            const response = await axios.post(`${extensionSettings.apiBaseUrl}`, {
                model: extensionSettings.model,
                prompt: lastUserMessage,
                stream: false
            }, {});

            const message = response.data;
            vscode.window.showInformationMessage(message);
        } catch (error) {
            console.error("Error interacting with custom GPT API: ", error);
            vscode.window.showErrorMessage("Error interacting with custom GPT API.");
        }
    });

    let showText = async (text: string) => {
        const document = await vscode.workspace.openTextDocument({
            content: text,
            language: "plaintext"
        });
        vscode.window.showTextDocument(document);
    };

    let disposable2 = vscode.commands.registerCommand('gptint.captureCode', async () => {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let document = editor.document;
            let text = document.getText();

            await showText(text);
        } else {
            vscode.window.showInformationMessage('No active editor.');
        }
    });

    let disposable3 = vscode.commands.registerCommand('gptint.showGptPanel', () => {
        panel = vscode.window.createWebviewPanel(
            'gptPanel',
            'Quack Debugging Assistant',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true
            }
        );

        panel.webview.html = getWebviewContent(context);

        let currentText = '';

        function updateCurrentText() {
            const editor = vscode.window.activeTextEditor;
            currentText = editor ? editor.document.getText() : '';
        }

        updateCurrentText();

        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
            if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                updateCurrentText();
            }
        }));

        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
            updateCurrentText();
        }));

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'getGPTSuggestion') {
                updateCurrentText();
                if (!currentText.trim()) {
                    panel.webview.postMessage({
                        command: 'displayMessage',
                        role: 'assistant',
                        content: "It seems like you haven't entered any code. Please type your code in the editor and then click 'Get GPT Suggestions'."
                    });
                    return;
                }
                panel.webview.postMessage({
                    command: 'displayMessage',
                    role: 'user',
                    content: currentText
                });
                GlobalconversationHistory.push({ role: 'user', content: currentText });

                let lastUserMessage = '';

                for (let i = GlobalconversationHistory.length - 1; i >= 0; i--) {
                    if (GlobalconversationHistory[i].role === 'user') {
                        lastUserMessage = GlobalconversationHistory[i].content;
                        break;
                    }
                }

                try {
                    const response = await axios.post(`${extensionSettings.apiBaseUrl}`, {
                        model: extensionSettings.model,
                        prompt: lastUserMessage,
                        stream: false
                    }, {});

                    const gptResponse = response.data.response;

                    GlobalconversationHistory.push({ role: 'assistant', content: gptResponse });

                    panel.webview.postMessage({
                        command: 'displayMessage',
                        role: 'assistant',
                        content: gptResponse
                    });
                } catch (error) {
                    console.error("Error fetching GPT suggestion: ", error);
                    panel.webview.postMessage({
                        command: 'displayMessage',
                        role: 'assistant',
                        content: 'Error fetching GPT suggestion.'
                    });
                }
            } else if (message.command === 'saveSettings') {
                extensionSettings.apiBaseUrl = message.settings.apiBaseUrl;
                extensionSettings.apiKey = message.settings.apiKey;
                extensionSettings.model = message.settings.model;
                vscode.window.showInformationMessage('Settings updated successfully.');
            } else if (message.command === 'sendMessageToGPT') {
                panel.webview.postMessage({
                    command: 'displayMessage',
                    role: 'user',
                    content: message.text
                });
                GlobalconversationHistory.push({ role: 'user', content: message.text });

                let lastUserMessage = '';
                for (let i = GlobalconversationHistory.length - 1; i >= 0; i--) {
                    if (GlobalconversationHistory[i].role === 'user') {
                        lastUserMessage = GlobalconversationHistory[i].content;
                        break;
                    }
                }

                try {
                    const response = await axios.post(`${extensionSettings.apiBaseUrl}`, {
                        model: extensionSettings.model,
                        prompt: lastUserMessage,
                        stream: false
                    }, {});

                    const gptResponse = response.data.response;

                    GlobalconversationHistory.push({ role: 'assistant', content: gptResponse });

                    panel.webview.postMessage({
                        command: 'displayMessage',
                        role: 'assistant',
                        content: gptResponse
                    });
                } catch (error) {
                    console.error("Error fetching GPT suggestion: ", error);
                    panel.webview.postMessage({
                        command: 'displayMessage',
                        role: 'assistant',
                        content: 'Error fetching GPT suggestion.'
                    });
                }
            } else if (message.command === 'sendAudioMessageToGPT') {
                console.log("Audio recorded");
                panel.webview.postMessage({
                    command: 'displayMessage',
                    role: 'assistant',
                    content: "Audio recorded successfully."
                });
            }
        }, undefined, context.subscriptions);
    });

    context.subscriptions.push(disposable1, disposable2, disposable3);
}

function getWebviewContent(context: vscode.ExtensionContext) {
    const webviewHtmlPath = path.join(context.extensionPath, 'src', 'webview', 'webviewContent.html');
    const htmlContent = fs.readFileSync(webviewHtmlPath, 'utf8');
    return htmlContent;
}

export function deactivate() {
    if (panel) {
        panel.dispose();
    }
    console.log('Your extension "my-gpt-extension" is now deactive!');
}
