"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const child_process_1 = require("child_process");
const util_1 = require("util");
const os = require("os");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * 插件激活函数
 */
function activate(context) {
    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('Go Struct Auto Fill');
    context.subscriptions.push(outputChannel);
    // 检查是否安装了 Go 插件
    const goExtension = vscode.extensions.getExtension('golang.go');
    if (!goExtension) {
        vscode.window.showErrorMessage('请先安装 Go 插件 (golang.Go)');
        return;
    }
    // 注册命令
    let disposable = vscode.commands.registerCommand('go-struct-auto-fill.fillStruct', async () => {
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine('开始执行结构体自动填充...');
        // 检查 Go 插件是否激活
        if (!goExtension.isActive) {
            try {
                await goExtension.activate();
                outputChannel.appendLine('Go 插件已激活');
            }
            catch (error) {
                outputChannel.appendLine(`Go 插件激活失败: ${error}`);
                vscode.window.showErrorMessage('Go 插件激活失败');
                return;
            }
        }
        // 获取当前编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            outputChannel.appendLine('未找到活动编辑器');
            return;
        }
        const document = editor.document;
        const position = editor.selection.active;
        // 获取当前行的文本
        const line = document.lineAt(position.line);
        const text = line.text;
        // 获取当前行之前的所有文本
        const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        outputChannel.appendLine(`当前行文本: ${text}`);
        outputChannel.appendLine(`光标位置: ${position.line}:${position.character}`);
        // 提取结构体名称
        // 匹配格式：
        // 1. 变量名 := 结构体名{
        // 2. var 变量名 = 结构体名{
        // 3. 变量名 := &结构体名{
        // 4. var 变量名 = &结构体名{
        // 5. 字段名: 结构体名{  (嵌套结构体情况)
        let structName = '';
        let isNestedStruct = false;
        // 首先，尝试从当前行和周围行判断我们是否在嵌套结构体内部
        // 这个逻辑需要查找像 "Next1: ListNode1{" 这样的模式
        const currentLineText = text.trim();
        // 检查当前行是否包含某个字段的赋值（如 Name: ""）
        const fieldAssignmentRegex = /^\s*(\w+):\s*(.+),?\s*$/;
        const fieldAssignmentMatch = currentLineText.match(fieldAssignmentRegex);
        if (fieldAssignmentMatch) {
            outputChannel.appendLine(`检测到字段赋值: ${fieldAssignmentMatch[1]}: ${fieldAssignmentMatch[2]}`);
            // 向上查找找到包含结构体类型的行，如 "Next1: ListNode1{"
            let searchLine = position.line - 1;
            while (searchLine >= 0) {
                const lineText = document.lineAt(searchLine).text;
                outputChannel.appendLine(`向上查找结构体声明，检查行 ${searchLine}: ${lineText}`);
                // 匹配嵌套结构体声明
                const nestedStructRegex = /(\w+):\s*([\w\.]+)\s*{/;
                const nestedMatch = lineText.match(nestedStructRegex);
                if (nestedMatch) {
                    structName = nestedMatch[2]; // 捕获结构体名称，如 "ListNode1"
                    isNestedStruct = true;
                    outputChannel.appendLine(`找到嵌套结构体声明: ${nestedMatch[1]}: ${structName}{`);
                    break;
                }
                // 如果遇到更高一级的结构体声明或其他关键代码，停止查找
                if (lineText.includes(":=") || lineText.includes("func ")) {
                    break;
                }
                searchLine--;
            }
        }
        // 如果没有找到嵌套结构体，尝试匹配当前行是否是嵌套结构体声明
        if (!structName) {
            const nestedStructMatch = text.match(/(\w+):\s*([\w\.]+)\s*{/);
            if (nestedStructMatch) {
                structName = nestedStructMatch[2];
                isNestedStruct = true;
                outputChannel.appendLine(`当前行是嵌套结构体声明: ${structName}`);
            }
            else {
                // 尝试匹配普通结构体初始化，优先匹配光标所在行及其周围的代码
                let structMatch;
                const surroundingLines = 10; // 向上和向下查找的行数
                const startLine = Math.max(0, position.line - surroundingLines);
                const endLine = Math.min(document.lineCount - 1, position.line + surroundingLines);
                for (let i = startLine; i <= endLine; i++) {
                    const lineText = document.lineAt(i).text;
                    const lineMatch = lineText.match(/(?:var\s+)?(\w+)\s*(?:=|\:=)\s*(?:&)?([\w\.]+)\s*{/);
                    if (lineMatch) {
                        // 如果有多个匹配项，选择最接近光标位置的那个
                        if (!structMatch || Math.abs(i - position.line) < Math.abs(structMatch.line - position.line)) {
                            structMatch = {
                                line: i,
                                name: lineMatch[2]
                            };
                        }
                    }
                }
                if (!structMatch) {
                    outputChannel.appendLine('无法识别结构体初始化语句');
                    vscode.window.showErrorMessage('无法识别结构体初始化语句，请确保光标位于结构体初始化的大括号内');
                    return;
                }
                structName = structMatch.name;
                outputChannel.appendLine(`找到普通结构体初始化: ${structName}`);
            }
        }
        outputChannel.appendLine(`找到结构体名称: ${structName}`);
        try {
            outputChannel.appendLine('正在获取结构体信息...');
            // 确定正确的位置获取补全项
            // 如果是嵌套结构体，我们需要在"{" 后面获取补全项
            let completionPosition = position;
            // 为嵌套结构体创建一个临时文档，以获取正确的补全项
            let tmpDocument = document;
            if (isNestedStruct) {
                try {
                    // 创建一个临时文本，包含简单的结构体初始化，便于获取补全项
                    const tmpText = `package main\n\nfunc main() {\n\ta := ${structName}{}\n}\n`;
                    const tmpUri = vscode.Uri.parse(`untitled:${structName}_temp.go`);
                    // 创建临时文档并设置内容
                    await vscode.workspace.openTextDocument(tmpUri).then(async (doc) => {
                        const edit = new vscode.WorkspaceEdit();
                        edit.insert(tmpUri, new vscode.Position(0, 0), tmpText);
                        await vscode.workspace.applyEdit(edit);
                        tmpDocument = doc;
                        // 设置补全位置在临时文档的结构体初始化处
                        completionPosition = new vscode.Position(3, tmpText.indexOf('{') + 1);
                        outputChannel.appendLine(`创建临时文档获取 ${structName} 的补全项，位置: ${completionPosition.line}:${completionPosition.character}`);
                    });
                }
                catch (err) {
                    outputChannel.appendLine(`创建临时文档出错: ${err}`);
                }
            }
            // 使用 gopls 的 API 获取结构体信息
            let completionItems;
            try {
                outputChannel.appendLine(`尝试在 ${tmpDocument.uri.toString()} 的位置 ${completionPosition.line}:${completionPosition.character} 获取补全项`);
                completionItems = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', tmpDocument.uri, completionPosition);
            }
            catch (err) {
                outputChannel.appendLine(`获取补全项时出错: ${err}`);
            }
            outputChannel.appendLine(`补全项类型: ${typeof completionItems}`);
            outputChannel.appendLine(`补全项: ${JSON.stringify(completionItems, null, 2)}`);
            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items) || completionItems.items.length === 0) {
                outputChannel.appendLine('未获取到有效的补全项，尝试通过结构体定义获取字段...');
                // 尝试使用工作区符号查找结构体定义
                try {
                    const workspaceSymbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', structName);
                    outputChannel.appendLine(`工作区符号查询结果: ${JSON.stringify(workspaceSymbols, null, 2)}`);
                    if (workspaceSymbols && workspaceSymbols.length > 0) {
                        outputChannel.appendLine(`找到工作区符号数量: ${workspaceSymbols.length}`);
                        // 寻找匹配的结构体定义
                        for (const symbol of workspaceSymbols) {
                            if (symbol.name === structName && symbol.kind === vscode.SymbolKind.Struct) {
                                outputChannel.appendLine(`找到结构体定义: ${symbol.name}`);
                                // 获取包含结构体定义的文档
                                const structDoc = await vscode.workspace.openTextDocument(symbol.location.uri);
                                // 获取结构体定义的位置
                                const definitionPos = symbol.location.range.start;
                                // 在结构体定义位置获取补全项
                                try {
                                    completionItems = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', structDoc.uri, definitionPos);
                                    if (completionItems && completionItems.items && completionItems.items.length > 0) {
                                        outputChannel.appendLine(`在结构体定义处获取到补全项: ${completionItems.items.length} 项`);
                                        break;
                                    }
                                }
                                catch (err) {
                                    outputChannel.appendLine(`在结构体定义处获取补全项时出错: ${err}`);
                                }
                            }
                        }
                    }
                }
                catch (err) {
                    outputChannel.appendLine(`查询工作区符号时出错: ${err}`);
                }
            }
            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items)) {
                // 如果仍然无法获取补全项，尝试直接解析源代码
                outputChannel.appendLine('无法通过正常渠道获取结构体字段，尝试直接解析源代码...');
                // 获取所有Go文件
                const goFiles = await vscode.workspace.findFiles('**/*.go');
                for (const file of goFiles) {
                    const fileDoc = await vscode.workspace.openTextDocument(file);
                    const fileText = fileDoc.getText();
                    // 查找结构体定义
                    const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*{([^}]*)}`, 'g');
                    const match = structRegex.exec(fileText);
                    if (match) {
                        outputChannel.appendLine(`在文件 ${file.fsPath} 中找到结构体定义`);
                        // 提取字段
                        const fieldsContent = match[1];
                        outputChannel.appendLine(`提取的字段内容: ${fieldsContent}`);
                        // 解析字段
                        const fieldRegex = /(\w+)\s+([^\n;]+)/g;
                        let fieldMatch;
                        while ((fieldMatch = fieldRegex.exec(fieldsContent)) !== null) {
                            const name = fieldMatch[1];
                            const type = fieldMatch[2].split('//')[0].trim();
                            outputChannel.appendLine(`找到字段: ${name}: ${type}`);
                            // 创建一个假的补全项
                            if (!completionItems) {
                                completionItems = { items: [] };
                            }
                            else if (!completionItems.items) {
                                completionItems.items = [];
                            }
                            completionItems.items.push({
                                label: name,
                                kind: vscode.CompletionItemKind.Field,
                                detail: type
                            });
                        }
                        break;
                    }
                }
            }
            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items)) {
                outputChannel.appendLine('未获取到有效的补全项');
                vscode.window.showErrorMessage('无法获取结构体信息，请确保 Go 插件已正确安装并运行');
                return;
            }
            // 从补全项中提取结构体字段
            const fields = [];
            const processedFields = new Set(); // 用于跟踪已处理的字段，避免重复
            for (const item of completionItems.items) {
                outputChannel.appendLine(`处理补全项: ${JSON.stringify(item, null, 2)}`);
                if (item.kind === vscode.CompletionItemKind.Field) {
                    const fieldName = typeof item.label === 'string' ? item.label : item.label.label;
                    // 跳过已处理的字段
                    if (processedFields.has(fieldName)) {
                        outputChannel.appendLine(`跳过重复字段: ${fieldName}`);
                        continue;
                    }
                    // 跳过嵌套字段（包含点的字段名）
                    if (fieldName.includes('.')) {
                        outputChannel.appendLine(`跳过嵌套字段: ${fieldName}`);
                        continue;
                    }
                    const fieldType = item.detail || '';
                    outputChannel.appendLine(`找到字段: ${JSON.stringify({ name: fieldName, type: fieldType }, null, 2)}`);
                    // 检查字段是否已存在于当前结构体中
                    let existingText = '';
                    if (isNestedStruct) {
                        // 获取嵌套结构体的开始和结束位置
                        let structStartLine = -1;
                        let structEndLine = -1;
                        // 向上查找结构体开始位置
                        let searchLine = position.line;
                        while (searchLine >= 0) {
                            const lineText = document.lineAt(searchLine).text;
                            if (lineText.includes(`${structName}{`) || lineText.includes(`${structName} {`)) {
                                structStartLine = searchLine;
                                break;
                            }
                            // 如果遇到上一级结构体，停止搜索
                            if (searchLine !== position.line && (lineText.includes(':=') || lineText.includes('func '))) {
                                break;
                            }
                            searchLine--;
                        }
                        // 向下查找结构体结束位置
                        searchLine = position.line;
                        let braceCount = 0;
                        let foundStart = false;
                        while (searchLine < document.lineCount) {
                            const lineText = document.lineAt(searchLine).text;
                            // 计算大括号数量
                            for (const char of lineText) {
                                if (char === '{') {
                                    if (!foundStart && searchLine >= structStartLine) {
                                        foundStart = true;
                                    }
                                    braceCount++;
                                }
                                else if (char === '}') {
                                    braceCount--;
                                    if (foundStart && braceCount === 0) {
                                        structEndLine = searchLine;
                                        break;
                                    }
                                }
                            }
                            if (structEndLine !== -1) {
                                break;
                            }
                            searchLine++;
                        }
                        // 如果找到了结构体的范围，获取其中的文本
                        if (structStartLine !== -1 && structEndLine !== -1) {
                            for (let i = structStartLine; i <= structEndLine; i++) {
                                existingText += document.lineAt(i).text + '\n';
                            }
                        }
                    }
                    else {
                        // 对于顶层结构体，检查整个文档
                        existingText = document.getText();
                    }
                    // 更精确的字段检测正则表达式
                    const fieldRegex = new RegExp(`\\b${fieldName}\\s*:`, 'i');
                    if (fieldRegex.test(existingText)) {
                        outputChannel.appendLine(`字段已存在于结构体中，跳过: ${fieldName}`);
                        continue;
                    }
                    else {
                        outputChannel.appendLine(`字段不存在，将添加: ${fieldName}`);
                    }
                    // 添加字段并标记为已处理
                    fields.push({
                        name: fieldName,
                        type: fieldType.replace('*', ''),
                        isPointer: fieldType.startsWith('*'),
                        isOptional: false
                    });
                    processedFields.add(fieldName);
                }
            }
            if (fields.length === 0) {
                outputChannel.appendLine('没有需要填充的字段');
                vscode.window.showInformationMessage('结构体字段已全部填充');
                return;
            }
            outputChannel.appendLine(`需要填充的字段: ${JSON.stringify(fields, null, 2)}`);
            // 生成字段填充代码
            const fillCode = generateFillCode(fields, outputChannel);
            outputChannel.appendLine(`最终生成的代码: ${fillCode}`);
            // 如果生成了代码，则插入
            if (fillCode) {
                await editor.edit(editBuilder => {
                    // 计算插入位置
                    outputChannel.appendLine(`计算插入位置，当前位置: ${position.line}:${position.character}`);
                    // 首先查找当前行中的左大括号位置
                    const currentLine = document.lineAt(position.line);
                    const currentLineText = currentLine.text;
                    let braceIndex = currentLineText.indexOf('{');
                    let insertPosition;
                    if (braceIndex !== -1) {
                        // 如果当前行有左大括号，在其后插入
                        insertPosition = new vscode.Position(position.line, braceIndex + 1);
                        outputChannel.appendLine(`当前行找到左大括号，插入位置: ${position.line}:${braceIndex + 1}`);
                    }
                    else {
                        // 向上查找最近的带有左大括号的行
                        let lineWithBrace = position.line;
                        while (lineWithBrace >= 0) {
                            const checkLine = document.lineAt(lineWithBrace);
                            const checkText = checkLine.text;
                            const checkBraceIndex = checkText.indexOf('{');
                            if (checkBraceIndex !== -1) {
                                // 如果之前的行有左大括号，判断是否应该在其后插入
                                // 如果当前行是空行或只有右大括号，则可能是正确的插入位置
                                const textAfterBrace = checkText.substring(checkBraceIndex + 1).trim();
                                if (textAfterBrace === '' || position.line > lineWithBrace) {
                                    // 如果左大括号后面没有其他内容，或者当前行在左大括号之后的行
                                    // 在左大括号后插入
                                    insertPosition = new vscode.Position(lineWithBrace, checkBraceIndex + 1);
                                    outputChannel.appendLine(`在行 ${lineWithBrace} 找到左大括号，插入位置: ${lineWithBrace}:${checkBraceIndex + 1}`);
                                    break;
                                }
                            }
                            // 继续向上检查
                            lineWithBrace--;
                        }
                        // 如果未找到合适的插入位置，使用当前光标位置
                        if (!insertPosition) {
                            insertPosition = position;
                            outputChannel.appendLine(`未找到合适的大括号，使用当前光标位置: ${position.line}:${position.character}`);
                        }
                    }
                    // 插入生成的代码
                    editBuilder.insert(insertPosition, fillCode);
                    outputChannel.appendLine(`已在 ${insertPosition.line}:${insertPosition.character} 插入代码`);
                });
                outputChannel.appendLine('结构体字段填充完成');
                vscode.window.showInformationMessage('结构体字段填充完成');
            }
            else {
                outputChannel.appendLine('没有需要填充的字段');
                vscode.window.showInformationMessage('没有需要填充的字段');
            }
        }
        catch (error) {
            outputChannel.appendLine(`错误类型: ${typeof error}`);
            outputChannel.appendLine(`错误: ${error}`);
            if (error instanceof Error) {
                outputChannel.appendLine(`错误详情: ${error.message}`);
                outputChannel.appendLine(`错误堆栈: ${error.stack}`);
            }
            vscode.window.showErrorMessage(`获取结构体信息时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });
    context.subscriptions.push(disposable);
}
async function findStructDefinition(structName, currentFileUri) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return null;
    }
    // 首先在当前文件中查找
    const currentFileContent = await vscode.workspace.fs.readFile(currentFileUri);
    const currentFileText = currentFileContent.toString();
    // 改进正则表达式以匹配嵌套的结构体定义
    const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*{([^{}]|{[^{}]*})*}`);
    const match = currentFileText.match(structRegex);
    if (match) {
        return match[0];
    }
    // 在工作区中查找
    const files = await vscode.workspace.findFiles('**/*.go');
    for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = content.toString();
        const match = text.match(structRegex);
        if (match) {
            return match[0];
        }
    }
    // 如果结构体名称包含点（包名），尝试在第三方库中查找
    if (structName.includes('.')) {
        try {
            // 获取当前工作目录
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            // 获取 go.mod 文件路径
            const goModPath = path.join(workspaceRoot, 'go.mod');
            if (!fs.existsSync(goModPath)) {
                return null;
            }
            // 解析结构体名称，获取包名和结构体名
            const parts = structName.split('.');
            if (parts.length !== 2) {
                return null;
            }
            const [packageName, structType] = parts;
            // 使用 go list 命令获取模块信息
            const { stdout: moduleInfo } = await execAsync('go list -m all', { cwd: workspaceRoot });
            const modules = parseGoModules(moduleInfo);
            // 在模块中查找结构体
            for (const module of modules) {
                const modulePath = path.join(process.env.GOPATH || path.join(os.homedir(), 'go'), 'pkg', 'mod', module.path + '@' + module.version);
                if (fs.existsSync(modulePath)) {
                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(modulePath, '**/*.go'));
                    for (const file of files) {
                        const content = await vscode.workspace.fs.readFile(file);
                        const text = content.toString();
                        const match = text.match(structRegex);
                        if (match) {
                            return match[0];
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Error searching in third-party libraries:', error);
        }
    }
    return null;
}
function parseGoModules(moduleInfo) {
    return moduleInfo
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
        const [path, version] = line.split(' ');
        return { path, version };
    });
}
function parseStructFields(structDefinition) {
    const fields = [];
    // 提取结构体字段部分
    const fieldsMatch = structDefinition.match(/{([^{}]*)}/);
    if (!fieldsMatch) {
        return fields;
    }
    const fieldsText = fieldsMatch[1];
    // 改进正则表达式以匹配更复杂的字段定义
    const fieldRegex = /(\w+)\s+([*]?[a-zA-Z0-9_\.\[\]<>]+)(?:\s*`[^`]*`)?(?:\s*\/\/[^\n]*)?/g;
    let match;
    while ((match = fieldRegex.exec(fieldsText)) !== null) {
        const [, name, type] = match;
        fields.push({
            name,
            type: type.replace('*', ''),
            isPointer: type.startsWith('*'),
            isOptional: false // 这里可以添加对 omitempty 标签的检查
        });
    }
    return fields;
}
/**
 * 生成结构体字段填充代码
 * @param fields 结构体字段列表
 * @param outputChannel 输出通道
 * @returns 生成的代码字符串
 */
function generateFillCode(fields, outputChannel) {
    // 获取当前编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('未找到活动编辑器');
        return '';
    }
    const position = editor.selection.active;
    const document = editor.document;
    outputChannel.appendLine(`开始查找大括号，当前位置: ${position.line}:${position.character}`);
    // 从当前位置向左和向上查找括号
    let braceText = '';
    let bracePosition = -1;
    const lineAtCursor = document.lineAt(position.line);
    const textAtCursorLine = lineAtCursor.text;
    outputChannel.appendLine(`当前行完整文本: '${textAtCursorLine}'`);
    // 首先在当前行查找左大括号
    bracePosition = textAtCursorLine.indexOf('{');
    if (bracePosition !== -1) {
        braceText = textAtCursorLine.substring(0, bracePosition + 1);
        outputChannel.appendLine(`在当前行找到左大括号，位置: ${bracePosition}, 文本: '${braceText}'`);
    }
    else {
        // 从当前位置向上查找包含左大括号的行
        let currentLine = position.line - 1; // 从上一行开始向上查找
        let foundBrace = false;
        while (currentLine >= 0 && !foundBrace) {
            const line = document.lineAt(currentLine);
            const lineText = line.text;
            outputChannel.appendLine(`检查行 ${currentLine}: '${lineText}'`);
            // 在当前行查找左大括号
            bracePosition = lineText.indexOf('{');
            if (bracePosition !== -1) {
                foundBrace = true;
                braceText = lineText.substring(0, bracePosition + 1);
                outputChannel.appendLine(`在行 ${currentLine} 找到左大括号，位置: ${bracePosition}, 文本: '${braceText}'`);
                break;
            }
            currentLine--;
        }
        if (!foundBrace) {
            outputChannel.appendLine('未找到左大括号，尝试直接从文本匹配结构体初始化...');
            // 获取当前文档的所有文本
            const fullText = document.getText();
            outputChannel.appendLine(`获取完整文本长度: ${fullText.length}`);
            // 尝试匹配变量初始化的结构体
            const structRegex = /(\w+)\s*:=\s*(\w+)\s*{/g;
            let match;
            while ((match = structRegex.exec(fullText)) !== null) {
                outputChannel.appendLine(`找到匹配: ${match[0]}`);
                // 检查此匹配位置是否在光标之前
                const matchPos = document.positionAt(match.index);
                const matchEndPos = document.positionAt(match.index + match[0].length);
                outputChannel.appendLine(`匹配位置: ${matchPos.line}:${matchPos.character} - ${matchEndPos.line}:${matchEndPos.character}`);
                // 如果匹配在当前行或之前的几行，且与当前光标位置相近
                if (matchPos.line <= position.line &&
                    position.line - matchPos.line <= 5) { // 仅考虑最近的5行内
                    foundBrace = true;
                    braceText = match[0];
                    outputChannel.appendLine(`找到相关结构体初始化: '${braceText}'`);
                    break;
                }
            }
        }
    }
    if (!braceText) {
        outputChannel.appendLine('最终未找到左大括号，尝试使用固定缩进...');
        // 退而求其次，使用当前行的缩进
        const currentIndent = textAtCursorLine.match(/^\s*/)?.[0] || '';
        const innerIndent = currentIndent + '    ';
        // 生成字段代码
        const fieldLines = fields.map(field => {
            const defaultValue = getDefaultValue(field);
            return `${innerIndent}${field.name}: ${defaultValue},`;
        });
        if (fieldLines.length === 0) {
            outputChannel.appendLine('没有字段需要填充');
            return '';
        }
        // 在结构体初始化中插入字段
        const generatedCode = `\n${fieldLines.join('\n')}\n${currentIndent}`;
        outputChannel.appendLine(`使用默认缩进生成的代码:\n${generatedCode}`);
        return generatedCode;
    }
    // 提取缩进信息
    const baseIndent = braceText.match(/^\s*/)?.[0] || '';
    // 内部缩进应该更深一级
    const innerIndent = baseIndent + '    ';
    outputChannel.appendLine(`基础缩进: '${baseIndent}', 内部缩进: '${innerIndent}'`);
    // 检查我们是否在嵌套结构体内部
    let isNestedStruct = false;
    const nestedStructRegex = /(\w+):\s*(\w+)\s*{/;
    if (nestedStructRegex.test(textAtCursorLine) ||
        (position.line > 0 && nestedStructRegex.test(document.lineAt(position.line - 1).text))) {
        isNestedStruct = true;
        outputChannel.appendLine('检测到嵌套结构体环境');
    }
    // 生成字段代码，根据是否在嵌套结构体中调整缩进
    const fieldLines = fields.map(field => {
        const defaultValue = getDefaultValue(field);
        // 在嵌套结构体中，使用更深的缩进
        const fieldIndent = innerIndent;
        return `${fieldIndent}${field.name}: ${defaultValue},`;
    });
    // 如果没有字段，不生成代码
    if (fieldLines.length === 0) {
        outputChannel.appendLine('没有字段需要填充');
        return '';
    }
    // 结束缩进应该与起始缩进相同
    const endIndent = isNestedStruct ? innerIndent.slice(0, -4) : baseIndent;
    // 根据上下文生成代码
    let generatedCode;
    if (isNestedStruct) {
        // 在嵌套结构体中，直接生成字段列表
        generatedCode = `\n${fieldLines.join('\n')}\n${endIndent}`;
    }
    else {
        // 在顶层结构体中，前后加空行
        generatedCode = `\n${fieldLines.join('\n')}\n${endIndent}`;
    }
    outputChannel.appendLine(`生成的代码:\n${generatedCode}`);
    return generatedCode;
}
/**
 * 获取字段的默认值
 * @param field 结构体字段
 * @returns 默认值字符串
 */
function getDefaultValue(field) {
    // 如果是指针类型，返回 nil
    if (field.isPointer) {
        return 'nil';
    }
    // 处理基本类型
    const type = field.type.replace('*', '').toLowerCase();
    switch (type) {
        case 'string':
            return '""';
        case 'int':
        case 'int32':
        case 'int64':
        case 'uint':
        case 'uint32':
        case 'uint64':
            return '0';
        case 'float32':
        case 'float64':
            return '0.0';
        case 'bool':
            return 'false';
        default:
            // 处理数组类型
            if (type.includes('[') && type.includes(']')) {
                return 'nil';
            }
            // 处理其他类型（结构体等）
            return `${field.type}{}`;
    }
}
/**
 * 插件停用函数
 */
function deactivate() { }
//# sourceMappingURL=extension.js.map