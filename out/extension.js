"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode = require("vscode");
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
        outputChannel.appendLine(`当前行文本: ${text}`);
        outputChannel.appendLine(`光标位置: ${position.line}:${position.character}`);
        // 使用新的结构体识别逻辑
        const matchResult = identifyStructInitialization(document, position, outputChannel);
        if (!matchResult) {
            outputChannel.appendLine('无法识别结构体初始化语句');
            vscode.window.showErrorMessage('无法识别结构体初始化语句，请确保光标位于结构体初始化的大括号内');
            return;
        }
        const { structName, isNestedStruct, matchType } = matchResult;
        outputChannel.appendLine(`找到结构体: ${structName}, 类型: ${matchType}, 是否嵌套: ${isNestedStruct}`);
        try {
            outputChannel.appendLine('正在获取结构体信息...');
            // 不创建临时文档，直接在当前文档中获取补全项
            outputChannel.appendLine('尝试在当前文档中直接获取结构体字段补全项，不创建任何临时文件');
            // 优化补全位置的计算，适应不同的结构体初始化场景
            let completionPosition = position;
            // 对于复杂场景，尝试找到更合适的补全位置
            if (matchType !== 'variable' || isNestedStruct) {
                const optimizedPosition = findOptimalCompletionPosition(document, position, structName, matchType, outputChannel);
                if (optimizedPosition) {
                    completionPosition = optimizedPosition;
                }
            }
            // 使用 gopls 的 API 获取结构体信息（原有逻辑，用于普通变量初始化）
            let completionItems;
            try {
                outputChannel.appendLine(`尝试在当前文档 ${document.uri.toString()} 的位置 ${completionPosition.line}:${completionPosition.character} 获取补全项`);
                completionItems = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, completionPosition);
            }
            catch (err) {
                outputChannel.appendLine(`获取补全项时出错: ${err}`);
            }
            outputChannel.appendLine(`补全项类型: ${typeof completionItems}`);
            outputChannel.appendLine(`补全项: ${JSON.stringify(completionItems, null, 2)}`);
            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items) || completionItems.items.length === 0) {
                outputChannel.appendLine('未获取到有效的补全项');
                vscode.window.showErrorMessage('无法获取结构体信息，请确保 Go 插件已正确安装并运行');
                return;
            }
            // 解析当前结构体中已有的字段
            const existingFields = parseExistingStructFields(document, position, outputChannel);
            // 使用新的有序字段生成逻辑
            const { code: orderedFieldsCode, addedFields } = await generateOrderedFieldsCode(structName, completionItems, existingFields, outputChannel, matchType);
            if (!orderedFieldsCode) {
                outputChannel.appendLine('没有生成任何字段代码');
                vscode.window.showErrorMessage('无法生成结构体字段代码');
                return;
            }
            if (addedFields.length === 0) {
                outputChannel.appendLine('没有需要填充的新字段');
                vscode.window.showInformationMessage('结构体字段已全部填充');
                return;
            }
            outputChannel.appendLine(`新添加的字段: [${addedFields.join(', ')}]`);
            outputChannel.appendLine(`最终生成的有序代码:\n${orderedFieldsCode}`);
            // 替换整个结构体内容而不是简单追加
            await editor.edit(editBuilder => {
                const replaceRange = calculateStructContentRange(document, position, outputChannel);
                if (replaceRange) {
                    // 替换整个结构体内容
                    editBuilder.replace(replaceRange, orderedFieldsCode);
                    outputChannel.appendLine(`已替换结构体内容，范围: ${replaceRange.start.line}:${replaceRange.start.character} - ${replaceRange.end.line}:${replaceRange.end.character}`);
                }
                else {
                    // 如果无法确定替换范围，使用插入模式（兼容性处理）
                    const insertPosition = calculateInsertPosition(document, position, matchType, outputChannel);
                    editBuilder.insert(insertPosition, '\n' + orderedFieldsCode);
                    outputChannel.appendLine(`已在 ${insertPosition.line}:${insertPosition.character} 插入代码（兼容模式）`);
                }
            });
            const message = `已按结构体定义顺序填充 ${addedFields.length} 个字段: ${addedFields.join(', ')}`;
            outputChannel.appendLine('结构体字段按顺序填充完成');
            vscode.window.showInformationMessage(message);
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
exports.activate = activate;
/**
 * 识别结构体初始化语句
 * 支持多种Go结构体初始化场景
 */
function identifyStructInitialization(document, position, outputChannel) {
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;
    outputChannel.appendLine(`开始识别结构体初始化，当前行: ${currentLineText}`);
    // 获取光标前的文本内容，用于更准确的匹配
    const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 20), 0), position));
    outputChannel.appendLine(`光标前文本: ${textBeforeCursor}`);
    // 新的通用结构体上下文分析
    const contextResult = analyzeStructContext(document, position, outputChannel);
    if (contextResult) {
        return contextResult;
    }
    return null;
}
/**
 * 分析光标当前所在的结构体上下文
 * 这是一个更智能的函数，能够处理光标在结构体大括号内任何位置的情况
 */
function analyzeStructContext(document, position, outputChannel) {
    outputChannel.appendLine(`开始分析结构体上下文，光标位置: ${position.line}:${position.character}`);
    // 从当前位置向上查找，分析大括号匹配和结构体声明
    let braceStack = [];
    let currentLine = position.line;
    let currentChar = position.character;
    // 首先分析当前行光标位置之前的字符
    const currentLineText = document.lineAt(currentLine).text;
    for (let i = currentChar - 1; i >= 0; i--) {
        const char = currentLineText[i];
        if (char === '}') {
            braceStack.push({ line: currentLine, char: i, type: 'close' });
        }
        else if (char === '{') {
            if (braceStack.length > 0 && braceStack[braceStack.length - 1].type === 'close') {
                braceStack.pop(); // 匹配的大括号对
            }
            else {
                // 找到了当前光标所在的开括号
                const structMatch = findStructDeclarationBeforeBrace(document, currentLine, i, outputChannel);
                if (structMatch) {
                    return structMatch;
                }
            }
        }
    }
    // 继续向上查找
    for (let lineNum = currentLine - 1; lineNum >= Math.max(0, currentLine - 50); lineNum--) {
        const lineText = document.lineAt(lineNum).text;
        // 从行尾向行首分析
        for (let charPos = lineText.length - 1; charPos >= 0; charPos--) {
            const char = lineText[charPos];
            if (char === '}') {
                braceStack.push({ line: lineNum, char: charPos, type: 'close' });
            }
            else if (char === '{') {
                if (braceStack.length > 0 && braceStack[braceStack.length - 1].type === 'close') {
                    braceStack.pop(); // 匹配的大括号对
                }
                else {
                    // 找到了一个未匹配的开括号，这可能是我们要找的结构体
                    const structMatch = findStructDeclarationBeforeBrace(document, lineNum, charPos, outputChannel);
                    if (structMatch) {
                        outputChannel.appendLine(`找到匹配的结构体声明在行 ${lineNum}:${charPos}`);
                        return structMatch;
                    }
                }
            }
        }
    }
    outputChannel.appendLine('未找到匹配的结构体上下文');
    return null;
}
/**
 * 在指定的大括号位置之前查找结构体声明
 */
function findStructDeclarationBeforeBrace(document, braceLineNum, braceCharPos, outputChannel) {
    // 获取大括号所在行的文本
    const braceLineText = document.lineAt(braceLineNum).text;
    const textBeforeBrace = braceLineText.substring(0, braceCharPos).trim();
    outputChannel.appendLine(`分析大括号前的文本: "${textBeforeBrace}"`);
    // 检查是否是嵌套结构体字段赋值 - 支持包名
    const nestedFieldMatch = textBeforeBrace.match(/(\w+):\s*&?([\w\.]+)$/);
    if (nestedFieldMatch) {
        const structName = nestedFieldMatch[2];
        outputChannel.appendLine(`找到嵌套结构体字段: ${nestedFieldMatch[1]}: ${structName}`);
        return {
            structName,
            isNestedStruct: true,
            matchType: 'nested'
        };
    }
    // 检查各种结构体初始化模式
    // 1. 数组初始化（同一行）- 支持包名
    const arrayMatch = textBeforeBrace.match(/\[\]\s*([\w\.]+)$/) ||
        textBeforeBrace.match(/\w+\s*:=\s*\[\]\s*([\w\.]+)$/);
    if (arrayMatch) {
        const structName = arrayMatch[1];
        outputChannel.appendLine(`找到数组结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'array'
        };
    }
    // 2. Map初始化（同一行）- 支持包名
    const mapMatch = textBeforeBrace.match(/map\[[^\]]+\]\s*([\w\.]+)$/) ||
        textBeforeBrace.match(/\w+\s*:=\s*map\[[^\]]+\]\s*([\w\.]+)$/) ||
        textBeforeBrace.match(/"[^"]*":\s*([\w\.]+)$/);
    if (mapMatch) {
        const structName = mapMatch[1];
        outputChannel.appendLine(`找到map结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'map'
        };
    }
    // 3. append函数（同一行）- 支持包名
    const appendMatch = textBeforeBrace.match(/append\([^,]+,\s*([\w\.]+)$/) ||
        textBeforeBrace.match(/append\([^,]+,\s*[^,]*,\s*([\w\.]+)$/);
    if (appendMatch) {
        const structName = appendMatch[1];
        outputChannel.appendLine(`找到append结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'append'
        };
    }
    // 4. 函数参数（同一行）- 支持包名
    const funcParamMatch = textBeforeBrace.match(/\w+\([^)]*([\w\.]+)$/) ||
        textBeforeBrace.match(/\w+\([^)]*,\s*([\w\.]+)$/);
    if (funcParamMatch) {
        const structName = funcParamMatch[1];
        outputChannel.appendLine(`找到函数参数结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'function_param'
        };
    }
    // 5. 普通变量初始化（同一行）- 支持包名和指针
    const variableMatch = textBeforeBrace.match(/(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?([\w\.]+)$/);
    if (variableMatch) {
        const structName = variableMatch[2];
        outputChannel.appendLine(`找到普通变量结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'variable'
        };
    }
    // 6. 特殊情况：只有结构体名称（可能是数组元素、map值等）- 支持包名
    const structNameMatch = textBeforeBrace.match(/^([\w\.]+)$/);
    if (structNameMatch) {
        const structName = structNameMatch[1];
        outputChannel.appendLine(`检测到单独的结构体名称: ${structName}，开始上下文分析`);
        // 向上查找上下文来确定这是什么类型的初始化
        const contextResult = analyzeStructContextByLookingUp(document, braceLineNum, structName, outputChannel);
        if (contextResult) {
            return contextResult;
        }
    }
    // 7. 如果当前行没有完整的声明，向上查找
    const variableDeclaration = findVariableDeclarationBeforeBrace(document, braceLineNum, braceCharPos, outputChannel);
    if (variableDeclaration) {
        const structName = variableDeclaration[2];
        outputChannel.appendLine(`找到跨行变量结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'variable'
        };
    }
    // 8. 处理跨行的结构体声明
    const multiLineMatch = findMultiLineStructDeclaration(document, braceLineNum, braceCharPos, outputChannel);
    if (multiLineMatch) {
        return multiLineMatch;
    }
    return null;
}
/**
 * 通过向上查找来分析结构体上下文
 * 用于处理只有结构体名称的情况，如数组元素、map值等
 */
function analyzeStructContextByLookingUp(document, braceLineNum, structName, outputChannel) {
    outputChannel.appendLine(`开始向上查找 "${structName}" 的上下文`);
    // 转义结构体名称中的点号，用于正则表达式
    const escapedStructName = structName.replace(/\./g, '\\.');
    // 向上查找最多10行来确定上下文
    for (let lineNum = braceLineNum - 1; lineNum >= Math.max(0, braceLineNum - 10); lineNum--) {
        const lineText = document.lineAt(lineNum).text;
        outputChannel.appendLine(`检查行 ${lineNum}: "${lineText}"`);
        // 检查是否是数组声明 - 更灵活的模式匹配，支持包名
        const arrayPatterns = [
            // 基本数组模式：[]pkg.StructName{
            new RegExp(`\\[\\]\\s*${escapedStructName}\\s*{\\s*$`),
            // 变量赋值数组模式：varName := []pkg.StructName{
            new RegExp(`(\\w+)\\s*:=\\s*\\[\\]\\s*${escapedStructName}\\s*{\\s*$`),
            // var声明数组模式：var varName = []pkg.StructName{
            new RegExp(`var\\s+(\\w+)\\s*=\\s*\\[\\]\\s*${escapedStructName}\\s*{\\s*$`),
            // 更宽松的数组模式，不要求大括号在行末
            new RegExp(`\\[\\]\\s*${escapedStructName}\\s*{`),
            new RegExp(`(\\w+)\\s*:=\\s*\\[\\]\\s*${escapedStructName}\\s*{`),
            new RegExp(`var\\s+(\\w+)\\s*=\\s*\\[\\]\\s*${escapedStructName}\\s*{`)
        ];
        for (const pattern of arrayPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到数组上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'array'
                };
            }
        }
        // 检查是否是Map声明 - 更灵活的模式匹配，支持包名
        const mapPatterns = [
            // 基本map模式：map[KeyType]pkg.StructName{
            new RegExp(`map\\[[^\\]]+\\]\\s*${escapedStructName}\\s*{\\s*$`),
            // 变量赋值map模式：varName := map[KeyType]pkg.StructName{
            new RegExp(`(\\w+)\\s*:=\\s*map\\[[^\\]]+\\]\\s*${escapedStructName}\\s*{\\s*$`),
            // map值模式："key": pkg.StructName{
            new RegExp(`"[^"]*":\\s*${escapedStructName}\\s*{\\s*$`),
            // 更宽松的map模式
            new RegExp(`map\\[[^\\]]+\\]\\s*${escapedStructName}\\s*{`),
            new RegExp(`(\\w+)\\s*:=\\s*map\\[[^\\]]+\\]\\s*${escapedStructName}\\s*{`),
            new RegExp(`"[^"]*":\\s*${escapedStructName}\\s*{`)
        ];
        for (const pattern of mapPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到map上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'map'
                };
            }
        }
        // 检查是否是append函数 - 更灵活的模式匹配，支持包名
        const appendPatterns = [
            // append模式：append(slice, pkg.StructName{
            new RegExp(`append\\([^,]+,\\s*${escapedStructName}\\s*{\\s*$`),
            // append多参数模式：append(slice, other, pkg.StructName{
            new RegExp(`append\\([^,]+,\\s*[^,]*,\\s*${escapedStructName}\\s*{\\s*$`),
            // 更宽松的append模式
            new RegExp(`append\\([^,]+,\\s*${escapedStructName}\\s*{`),
            new RegExp(`append\\([^,]+,\\s*[^,]*,\\s*${escapedStructName}\\s*{`)
        ];
        for (const pattern of appendPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到append上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'append'
                };
            }
        }
        // 检查是否是函数参数 - 更灵活的模式匹配，支持包名
        const funcParamPatterns = [
            // 函数参数模式：funcName(pkg.StructName{
            new RegExp(`\\w+\\([^)]*${escapedStructName}\\s*{\\s*$`),
            // 函数多参数模式：funcName(param, pkg.StructName{
            new RegExp(`\\w+\\([^)]*,\\s*${escapedStructName}\\s*{\\s*$`),
            // 更宽松的函数参数模式
            new RegExp(`\\w+\\([^)]*${escapedStructName}\\s*{`),
            new RegExp(`\\w+\\([^)]*,\\s*${escapedStructName}\\s*{`)
        ];
        for (const pattern of funcParamPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到函数参数上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'function_param'
                };
            }
        }
        // 新增：检查是否包含数组、map等关键字，即使格式不完全匹配
        if (lineText.includes('[]') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到数组上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'array'
            };
        }
        if (lineText.includes('map[') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到map上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'map'
            };
        }
        if (lineText.includes('append(') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到append上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'append'
            };
        }
        // 如果遇到其他赋值语句或函数声明，停止查找
        if (lineText.includes('func ') || (lineText.includes(':=') && !lineText.includes(structName))) {
            outputChannel.appendLine(`遇到函数或其他赋值，停止查找`);
            break;
        }
    }
    outputChannel.appendLine(`未找到明确的上下文，默认为普通变量初始化`);
    return {
        structName,
        isNestedStruct: false,
        matchType: 'variable'
    };
}
/**
 * 查找跨行的变量声明
 */
function findVariableDeclarationBeforeBrace(document, braceLineNum, braceCharPos, outputChannel) {
    // 向上查找变量声明
    for (let lineNum = braceLineNum - 1; lineNum >= Math.max(0, braceLineNum - 3); lineNum--) {
        const lineText = document.lineAt(lineNum).text.trim();
        outputChannel.appendLine(`向上查找变量声明，检查行 ${lineNum}: "${lineText}"`);
        // 匹配变量声明模式 - 支持包名
        const variableMatch = lineText.match(/(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?([\w\.]+)$/);
        if (variableMatch) {
            outputChannel.appendLine(`找到跨行变量声明: ${variableMatch[1]} := ${variableMatch[2]}`);
            return variableMatch;
        }
        // 如果遇到其他赋值语句或函数声明，停止查找
        if (lineText.includes('func ') || (lineText.includes(':=') && !lineText.includes('{'))) {
            break;
        }
    }
    return null;
}
/**
 * 查找跨行的结构体声明
 */
function findMultiLineStructDeclaration(document, braceLineNum, braceCharPos, outputChannel) {
    // 合并当前行和前面几行的文本来查找完整的声明
    let combinedText = '';
    let startLine = Math.max(0, braceLineNum - 5); // 增加查找范围
    for (let lineNum = startLine; lineNum <= braceLineNum; lineNum++) {
        const lineText = document.lineAt(lineNum).text;
        if (lineNum === braceLineNum) {
            // 只取大括号之前的部分
            combinedText += ' ' + lineText.substring(0, braceCharPos);
        }
        else {
            combinedText += ' ' + lineText;
        }
    }
    combinedText = combinedText.trim().replace(/\s+/g, ' '); // 清理多余空格
    outputChannel.appendLine(`分析合并后的文本: "${combinedText}"`);
    // 尝试匹配各种模式
    const patterns = [
        // 普通变量声明 - 支持包名
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?([\w\.]+)$/, type: 'variable' },
        // 数组初始化 - 基本格式，支持包名
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*\[\]\s*([\w\.]+)$/, type: 'array' },
        // 数组初始化 - 带元素，支持包名
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*\[\]\s*([\w\.]+)\s*{\s*([\w\.]+)$/, type: 'array' },
        // 数组元素，支持包名
        { regex: /\[\]\s*([\w\.]+)\s*{\s*.*?([\w\.]+)$/, type: 'array' },
        // Map初始化 - 基本格式，支持包名
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*map\[[^\]]+\]\s*([\w\.]+)$/, type: 'map' },
        // Map初始化 - 带值，支持包名
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*map\[[^\]]+\]\s*([\w\.]+)\s*{\s*.*?([\w\.]+)$/, type: 'map' },
        // Map值，支持包名
        { regex: /"[^"]*":\s*([\w\.]+)$/, type: 'map' },
        // append函数，支持包名
        { regex: /append\([^,]+,\s*([\w\.]+)$/, type: 'append' },
        { regex: /append\([^,]+,\s*[^,]*,\s*([\w\.]+)$/, type: 'append' },
        // 函数参数，支持包名
        { regex: /\w+\([^)]*([\w\.]+)$/, type: 'function_param' },
        { regex: /\w+\([^)]*,\s*([\w\.]+)$/, type: 'function_param' },
        // 复杂的数组元素场景，支持包名
        { regex: /(\w+)\s*:=\s*\[\]\s*([\w\.]+)\s*{\s*([\w\.]+)$/, type: 'array' },
        { regex: /(\w+)\s*:=\s*map\[[^\]]+\]\s*([\w\.]+)\s*{\s*"[^"]*":\s*([\w\.]+)$/, type: 'map' }
    ];
    for (const pattern of patterns) {
        const match = combinedText.match(pattern.regex);
        if (match) {
            // 确定结构体名称（通常是最后一个捕获组）
            let structName = '';
            for (let i = match.length - 1; i >= 1; i--) {
                if (match[i] && /^[A-Z][a-zA-Z0-9]*$/.test(match[i])) { // Go结构体命名约定
                    structName = match[i];
                    break;
                }
            }
            // 如果没有找到符合命名约定的，使用最后一个捕获组
            if (!structName) {
                structName = match[match.length - 1] || match[1];
            }
            let matchType = 'variable';
            // 根据模式类型和文本内容确定匹配类型
            if (pattern.type === 'array' || combinedText.includes('[]')) {
                matchType = 'array';
            }
            else if (pattern.type === 'map' || combinedText.includes('map[')) {
                matchType = 'map';
            }
            else if (pattern.type === 'append' || combinedText.includes('append(')) {
                matchType = 'append';
            }
            else if (pattern.type === 'function_param' || (combinedText.includes('(') && !combinedText.includes(':='))) {
                matchType = 'function_param';
            }
            else {
                matchType = 'variable';
            }
            outputChannel.appendLine(`在跨行文本中找到结构体声明: ${structName}, 类型: ${matchType}, 匹配模式: ${pattern.regex}`);
            return {
                structName,
                isNestedStruct: false,
                matchType
            };
        }
    }
    // 如果所有标准模式都不匹配，尝试提取可能的结构体名称
    const words = combinedText.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i];
        // 检查是否是有效的Go结构体名称（首字母大写，支持包名）
        if (/^[A-Z][a-zA-Z0-9]*$/.test(word) || /^[a-z][a-zA-Z0-9]*\.[A-Z][a-zA-Z0-9]*$/.test(word)) {
            outputChannel.appendLine(`尝试使用提取的结构体名称: ${word}`);
            // 根据上下文推断类型
            let matchType = 'variable';
            if (combinedText.includes('[]')) {
                matchType = 'array';
            }
            else if (combinedText.includes('map[')) {
                matchType = 'map';
            }
            else if (combinedText.includes('append(')) {
                matchType = 'append';
            }
            else if (combinedText.includes('(') && !combinedText.includes(':=')) {
                matchType = 'function_param';
            }
            return {
                structName: word,
                isNestedStruct: false,
                matchType
            };
        }
    }
    outputChannel.appendLine('在跨行文本中未找到匹配的结构体声明');
    return null;
}
/**
 * 计算插入位置
 */
function calculateInsertPosition(document, position, matchType, outputChannel) {
    outputChannel.appendLine(`计算插入位置，匹配类型: ${matchType}, 当前位置: ${position.line}:${position.character}`);
    // 首先查找当前行中的左大括号位置
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;
    let braceIndex = currentLineText.indexOf('{');
    if (braceIndex !== -1) {
        // 如果当前行有左大括号，在其后插入
        const insertPosition = new vscode.Position(position.line, braceIndex + 1);
        outputChannel.appendLine(`当前行找到左大括号，插入位置: ${position.line}:${braceIndex + 1}`);
        return insertPosition;
    }
    // 向上查找最近的带有左大括号的行
    let lineWithBrace = position.line - 1;
    while (lineWithBrace >= 0) {
        const checkLine = document.lineAt(lineWithBrace);
        const checkText = checkLine.text;
        const checkBraceIndex = checkText.indexOf('{');
        if (checkBraceIndex !== -1) {
            // 如果之前的行有左大括号，判断是否应该在其后插入
            const textAfterBrace = checkText.substring(checkBraceIndex + 1).trim();
            if (textAfterBrace === '' || position.line > lineWithBrace) {
                // 如果左大括号后面没有其他内容，或者当前行在左大括号之后的行
                const insertPosition = new vscode.Position(lineWithBrace, checkBraceIndex + 1);
                outputChannel.appendLine(`在行 ${lineWithBrace} 找到左大括号，插入位置: ${lineWithBrace}:${checkBraceIndex + 1}`);
                return insertPosition;
            }
        }
        lineWithBrace--;
    }
    // 如果未找到合适的插入位置，使用当前光标位置
    outputChannel.appendLine(`未找到合适的大括号，使用当前光标位置: ${position.line}:${position.character}`);
    return position;
}
/**
 * 计算需要替换的结构体内容范围（大括号内的所有内容）
 * 这个函数会精确地找到当前光标所在结构体的大括号内容，确保完全替换，避免字段重复
 */
function calculateStructContentRange(document, position, outputChannel) {
    try {
        outputChannel.appendLine(`计算结构体内容替换范围，当前位置: ${position.line}:${position.character}`);
        // 使用更精确的算法来找到当前光标所在结构体的开大括号和闭大括号
        let openBracePos = null;
        let closeBracePos = null;
        // 第1步：向上查找最近的开大括号
        for (let lineNum = position.line; lineNum >= 0; lineNum--) {
            const lineText = document.lineAt(lineNum).text;
            if (lineNum === position.line) {
                // 在当前行中，只查找光标位置之前的大括号
                for (let charPos = Math.min(position.character, lineText.length - 1); charPos >= 0; charPos--) {
                    if (lineText[charPos] === '{') {
                        openBracePos = new vscode.Position(lineNum, charPos);
                        break;
                    }
                }
            }
            else {
                // 在其他行中，查找最后一个开大括号
                const braceIndex = lineText.lastIndexOf('{');
                if (braceIndex !== -1) {
                    openBracePos = new vscode.Position(lineNum, braceIndex);
                    break;
                }
            }
        }
        if (!openBracePos) {
            outputChannel.appendLine('未找到开大括号');
            return null;
        }
        outputChannel.appendLine(`找到开大括号位置: ${openBracePos.line}:${openBracePos.character}`);
        // 第2步：从开大括号位置开始，向下查找匹配的闭大括号
        let braceCount = 0;
        let found = false;
        for (let lineNum = openBracePos.line; lineNum < document.lineCount && !found; lineNum++) {
            const lineText = document.lineAt(lineNum).text;
            // 确定在当前行中开始查找的位置
            let startPos = 0;
            if (lineNum === openBracePos.line) {
                startPos = openBracePos.character; // 从开大括号位置开始
            }
            for (let charPos = startPos; charPos < lineText.length; charPos++) {
                const char = lineText[charPos];
                if (char === '{') {
                    braceCount++;
                }
                else if (char === '}') {
                    braceCount--;
                    // 当计数为0时，找到了匹配的闭大括号
                    if (braceCount === 0) {
                        closeBracePos = new vscode.Position(lineNum, charPos);
                        found = true;
                        break;
                    }
                }
            }
        }
        if (!closeBracePos) {
            outputChannel.appendLine('未找到匹配的闭大括号');
            return null;
        }
        outputChannel.appendLine(`找到闭大括号位置: ${closeBracePos.line}:${closeBracePos.character}`);
        // 第3步：计算需要替换的精确范围，避免多余的空行
        let replaceStart;
        let replaceEnd;
        // 计算开始位置：寻找第一个有内容的行或者开大括号后的位置
        const openBraceLine = document.lineAt(openBracePos.line);
        const textAfterOpenBrace = openBraceLine.text.substring(openBracePos.character + 1).trim();
        if (textAfterOpenBrace === '') {
            // 开大括号后是空的，寻找第一个有内容的行
            let firstContentLine = openBracePos.line + 1;
            while (firstContentLine < closeBracePos.line) {
                const lineText = document.lineAt(firstContentLine).text.trim();
                if (lineText !== '') {
                    break;
                }
                firstContentLine++;
            }
            if (firstContentLine < closeBracePos.line) {
                // 找到了有内容的行，从该行开始
                replaceStart = new vscode.Position(firstContentLine, 0);
            }
            else {
                // 没有找到内容行，从开大括号后开始
                replaceStart = new vscode.Position(openBracePos.line, openBracePos.character + 1);
            }
        }
        else {
            // 开大括号后有内容，从开大括号后开始
            replaceStart = new vscode.Position(openBracePos.line, openBracePos.character + 1);
        }
        // 计算结束位置：寻找最后一个有内容的行或者闭大括号前的位置
        const closeBraceLine = document.lineAt(closeBracePos.line);
        const textBeforeCloseBrace = closeBraceLine.text.substring(0, closeBracePos.character).trim();
        if (textBeforeCloseBrace === '') {
            // 闭大括号前是空的，寻找最后一个有内容的行
            let lastContentLine = closeBracePos.line - 1;
            while (lastContentLine > openBracePos.line) {
                const lineText = document.lineAt(lastContentLine).text.trim();
                if (lineText !== '') {
                    break;
                }
                lastContentLine--;
            }
            if (lastContentLine > openBracePos.line) {
                // 找到了有内容的行，到该行末尾
                const lastContentLineText = document.lineAt(lastContentLine).text;
                replaceEnd = new vscode.Position(lastContentLine, lastContentLineText.length);
            }
            else {
                // 没有找到内容行，到闭大括号前
                replaceEnd = new vscode.Position(closeBracePos.line, closeBracePos.character);
            }
        }
        else {
            // 闭大括号前有内容，到闭大括号前
            replaceEnd = new vscode.Position(closeBracePos.line, closeBracePos.character);
        }
        const replaceRange = new vscode.Range(replaceStart, replaceEnd);
        outputChannel.appendLine(`计算出的精确替换范围: ${replaceRange.start.line}:${replaceRange.start.character} - ${replaceRange.end.line}:${replaceRange.end.character}`);
        // 输出要替换的内容用于调试
        const currentContent = document.getText(replaceRange);
        outputChannel.appendLine(`当前要替换的内容:\n"${currentContent}"`);
        return replaceRange;
    }
    catch (error) {
        outputChannel.appendLine(`计算结构体内容范围时出错: ${error}`);
        return null;
    }
}
/**
 * 生成结构体字段填充代码
 * @param fields 结构体字段列表
 * @param outputChannel 输出通道
 * @param matchType 匹配类型
 * @returns 生成的代码字符串
 */
function generateFillCode(fields, outputChannel, matchType) {
    // 获取当前编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('未找到活动编辑器');
        return '';
    }
    const position = editor.selection.active;
    const document = editor.document;
    outputChannel.appendLine(`开始生成代码，匹配类型: ${matchType}, 当前位置: ${position.line}:${position.character}`);
    // 分析缩进信息
    const indentInfo = analyzeIndentInfo(document, position, outputChannel);
    outputChannel.appendLine(`使用${indentInfo.type}缩进，大小: ${indentInfo.size}`);
    outputChannel.appendLine(`基础缩进: '${indentInfo.baseIndent}'`);
    outputChannel.appendLine(`字段缩进: '${indentInfo.fieldIndent}'`);
    // 获取现有字段的对齐信息
    const existingFields = parseExistingStructFields(document, position, outputChannel);
    let maxFieldNameLength = 0;
    existingFields.forEach((_, fieldName) => {
        maxFieldNameLength = Math.max(maxFieldNameLength, fieldName.length);
    });
    // 生成字段代码
    const fieldLines = fields.map(field => {
        const defaultValue = getDefaultValue(field);
        // 使用与现有字段相同的对齐方式
        const fieldName = field.name.padEnd(maxFieldNameLength);
        // 确保使用 tab 字符
        const indent = '\t'; // 直接使用 tab 字符
        return `${indent}${fieldName}: ${defaultValue},`;
    });
    // 如果没有字段，不生成代码
    if (fieldLines.length === 0) {
        outputChannel.appendLine('没有字段需要填充');
        return '';
    }
    // 根据匹配类型生成不同格式的代码
    let generatedCode;
    switch (matchType) {
        case 'array':
        case 'map':
        case 'append':
        case 'function_param':
        case 'nested':
        case 'variable':
        default:
            // 使用标准格式，保持一致的缩进
            const baseIndent = '\t'; // 直接使用 tab 字符
            generatedCode = `\n${fieldLines.join('\n')}\n${baseIndent}`;
            break;
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
exports.deactivate = deactivate;
// 解析完整结构体名称
function parseFullStructName(structName) {
    const parts = structName.split('.');
    if (parts.length === 1) {
        return { pkgName: '', structName: parts[0] };
    }
    return { pkgName: parts[0], structName: parts[1] };
}
async function getStructInfo(structName, document) {
    const { pkgName, structName: structNameOnly } = parseFullStructName(structName);
    // 如果是当前包的结构体
    if (!pkgName) {
        // 在当前包的所有.go文件中查找
        const goFiles = await vscode.workspace.findFiles('**/*.go');
        for (const file of goFiles) {
            const fileDoc = await vscode.workspace.openTextDocument(file);
            const fileText = fileDoc.getText();
            const structRegex = new RegExp(`type\\s+${structNameOnly}\\s+struct\\s*{([^}]*)}`, 'g');
            const match = structRegex.exec(fileText);
            if (match) {
                // 返回结构体信息
                return {
                    items: parseStructFields(match[1])
                };
            }
        }
    }
    else {
        // 如果是其他包的结构体
        // 查找导入的包路径
        const importRegex = new RegExp(`import\\s+"([^"]+)"`, 'g');
        const imports = [];
        let match;
        while ((match = importRegex.exec(document.getText())) !== null) {
            imports.push(match[1]);
        }
        // 查找匹配的包
        const pkgPath = imports.find(path => path.endsWith(pkgName));
        if (pkgPath) {
            // 在包路径中查找结构体
            const pkgFiles = await vscode.workspace.findFiles(`${pkgPath}/**/*.go`);
            for (const file of pkgFiles) {
                const fileDoc = await vscode.workspace.openTextDocument(file);
                const fileText = fileDoc.getText();
                const structRegex = new RegExp(`type\\s+${structNameOnly}\\s+struct\\s*{([^}]*)}`, 'g');
                const match = structRegex.exec(fileText);
                if (match) {
                    // 返回结构体信息
                    return {
                        items: parseStructFields(match[1])
                    };
                }
            }
        }
    }
    return null;
}
function parseStructFields(fieldsContent) {
    const fieldRegex = /(\w+)\s+([^\n;]+)/g;
    const fields = [];
    let match;
    while ((match = fieldRegex.exec(fieldsContent)) !== null) {
        const name = match[1];
        const type = match[2].split('//')[0].trim();
        fields.push({
            label: name,
            kind: vscode.CompletionItemKind.Field,
            detail: type
        });
    }
    return fields;
}
function checkFieldExistsInCurrentStruct(document, position, fieldName) {
    // 获取当前结构体的范围
    const structRange = getCurrentStructRange(document, position);
    if (!structRange)
        return false;
    // 获取当前结构体的文本
    const structText = document.getText(structRange);
    // 检查字段是否存在
    const fieldRegex = new RegExp(`\\b${fieldName}\\s*:`, 'i');
    return fieldRegex.test(structText);
}
function getCurrentStructRange(document, position) {
    let startLine = position.line;
    let endLine = position.line;
    let braceCount = 0;
    let foundOpenBrace = false;
    // 向上查找结构体开始位置（包含左大括号的行）
    while (startLine >= 0) {
        const lineText = document.lineAt(startLine).text;
        if (lineText.includes('{')) {
            foundOpenBrace = true;
            break;
        }
        startLine--;
    }
    if (!foundOpenBrace || startLine < 0) {
        return null;
    }
    // 从找到左大括号的行开始，向下查找匹配的右大括号
    endLine = startLine;
    braceCount = 0;
    while (endLine < document.lineCount) {
        const lineText = document.lineAt(endLine).text;
        for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            if (char === '{') {
                braceCount++;
            }
            else if (char === '}') {
                braceCount--;
                // 当大括号计数归零时，找到了匹配的结束大括号
                if (braceCount === 0) {
                    return new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, lineText.length));
                }
            }
        }
        endLine++;
    }
    // 如果没有找到匹配的右大括号，返回null
    return null;
}
/**
 * 在当前文档中寻找最佳的补全位置
 * 避免创建临时文档，直接在现有代码中找到合适的位置获取结构体字段补全
 */
function findOptimalCompletionPosition(document, position, structName, matchType, outputChannel) {
    outputChannel.appendLine(`为 ${structName} (类型: ${matchType}) 寻找最佳补全位置`);
    // 在当前位置附近寻找结构体初始化语句
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;
    // 如果当前行包含结构体名称和大括号，尝试在大括号内获取补全
    const structInitRegex = new RegExp(`${structName}\\s*{`);
    if (structInitRegex.test(currentLineText)) {
        const braceIndex = currentLineText.indexOf('{');
        if (braceIndex !== -1) {
            const testPosition = new vscode.Position(position.line, braceIndex + 1);
            outputChannel.appendLine(`在当前行找到结构体初始化，使用位置 ${position.line}:${braceIndex + 1}`);
            return testPosition;
        }
    }
    // 向上查找最近的结构体声明
    for (let lineOffset = 0; lineOffset <= 5; lineOffset++) {
        const targetLine = position.line - lineOffset;
        if (targetLine < 0)
            break;
        const lineText = document.lineAt(targetLine).text;
        // 检查是否包含目标结构体的初始化
        if (lineText.includes(structName) && lineText.includes('{')) {
            const braceIndex = lineText.indexOf('{');
            if (braceIndex !== -1) {
                // 尝试在大括号后面的位置
                let testPosition;
                // 如果大括号在行末，检查下一行
                if (braceIndex === lineText.trim().length - 1) {
                    if (targetLine + 1 < document.lineCount) {
                        const nextLineText = document.lineAt(targetLine + 1).text;
                        const indentMatch = nextLineText.match(/^(\s*)/);
                        const indent = indentMatch ? indentMatch[1].length : 0;
                        testPosition = new vscode.Position(targetLine + 1, Math.max(indent, 2));
                    }
                    else {
                        testPosition = new vscode.Position(targetLine, braceIndex + 1);
                    }
                }
                else {
                    testPosition = new vscode.Position(targetLine, braceIndex + 1);
                }
                outputChannel.appendLine(`在行 ${targetLine} 找到结构体初始化，使用位置 ${testPosition.line}:${testPosition.character}`);
                return testPosition;
            }
        }
    }
    // 如果没有找到特殊位置，返回当前位置
    outputChannel.appendLine('未找到特殊的补全位置，使用当前光标位置');
    return null;
}
/**
 * 解析当前结构体中已有的字段和值
 * 支持复杂的嵌套结构体值解析
 */
function parseExistingStructFields(document, position, outputChannel) {
    const fields = new Map();
    // 首先找到结构体初始化块的范围
    const structRange = getCurrentStructRange(document, position);
    if (!structRange) {
        outputChannel.appendLine('无法确定结构体初始化块范围，使用默认解析方式');
        // 回退到原来的解析方式
        const lines = [];
        for (let i = Math.max(0, position.line - 2); i <= position.line + 2; i++) {
            if (i < document.lineCount) {
                lines.push(document.lineAt(i).text);
            }
        }
        // 查找字段行
        for (const line of lines) {
            const fieldMatch = line.match(/^\s*(\w+)\s*:/);
            if (fieldMatch) {
                const fieldName = fieldMatch[1];
                const valueMatch = line.match(/:\s*(.+),/);
                if (valueMatch) {
                    fields.set(fieldName, valueMatch[1].trim());
                }
            }
        }
        return fields;
    }
    outputChannel.appendLine(`结构体初始化块范围: ${structRange.start.line}:${structRange.start.character} - ${structRange.end.line}:${structRange.end.character}`);
    // 解析整个结构体初始化块中的所有字段
    for (let lineNum = structRange.start.line; lineNum <= structRange.end.line; lineNum++) {
        const line = document.lineAt(lineNum).text;
        // 跳过开大括号和闭大括号行
        if (line.trim() === '{' || line.trim() === '}') {
            continue;
        }
        // 跳过包含变量声明的行（如 userInfo := &user.User{）
        if (line.includes(':=') || line.includes('=') && !line.includes(':')) {
            continue;
        }
        // 更严格的字段行匹配：确保是有效的字段定义
        // 字段行格式：[空白]FieldName: Value[,]
        const fieldMatch = line.match(/^\s*([A-Z][a-zA-Z0-9]*)\s*:\s*(.+?)(?:,\s*)?$/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1];
            let fieldValue = fieldMatch[2].trim();
            // 移除末尾的逗号
            if (fieldValue.endsWith(',')) {
                fieldValue = fieldValue.slice(0, -1).trim();
            }
            if (fieldValue) {
                fields.set(fieldName, fieldValue);
                outputChannel.appendLine(`解析到已存在字段: ${fieldName} = ${fieldValue}`);
            }
        }
    }
    outputChannel.appendLine(`总共解析到 ${fields.size} 个已存在字段: [${Array.from(fields.keys()).join(', ')}]`);
    return fields;
}
/**
 * 根据补全项获取结构体字段的完整顺序
 * 过滤掉不可访问的字段
 */
function getStructFieldOrder(completionItems, outputChannel) {
    const fieldOrder = [];
    // 定义不可访问的字段名称（protobuf 生成的内部字段）
    const inaccessibleFields = new Set([
        'state',
        'unknownFields',
        'sizeCache',
        'XXX_unrecognized',
        'XXX_sizecache',
        'XXX_NoUnkeyedLiteral',
        'XXX_unrecognized',
        'XXX_sizecache',
        'XXX_InternalExtensions',
        'XXX_extensions'
    ]);
    for (const item of completionItems.items) {
        if (item.kind === vscode.CompletionItemKind.Field) {
            const fieldName = typeof item.label === 'string' ? item.label : item.label.label;
            // 过滤掉包含点号的字段（嵌套字段）
            if (fieldName.includes('.')) {
                continue;
            }
            // 过滤掉不可访问的字段
            if (inaccessibleFields.has(fieldName)) {
                outputChannel.appendLine(`跳过不可访问字段: ${fieldName}`);
                continue;
            }
            // 过滤掉以小写字母开头的私有字段
            if (fieldName[0] === fieldName[0].toLowerCase()) {
                outputChannel.appendLine(`跳过私有字段: ${fieldName}`);
                continue;
            }
            fieldOrder.push(fieldName);
        }
    }
    outputChannel.appendLine(`结构体字段定义顺序: [${fieldOrder.join(', ')}]`);
    return fieldOrder;
}
/**
 * 生成按照定义顺序排列的完整结构体字段代码
 */
async function generateOrderedFieldsCode(structName, completionItems, existingFields, outputChannel, matchType) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { code: '', addedFields: [] };
    }
    const document = editor.document;
    const position = editor.selection.active;
    // 使用新的函数获取正确的字段定义顺序
    let fieldDefinitions = await getStructFieldDefinitionOrder(structName, document, outputChannel);
    const addedFields = [];
    if (fieldDefinitions.length === 0) {
        outputChannel.appendLine('没有找到结构体字段定义顺序，尝试使用补全项顺序');
        // 如果获取不到定义，回退到补全项顺序
        const fieldOrder = getStructFieldOrder(completionItems, outputChannel);
        if (fieldOrder.length === 0) {
            return { code: '', addedFields: [] };
        }
        // 将补全项转换为字段定义格式
        fieldDefinitions = fieldOrder.map(name => {
            const fieldItem = completionItems.items.find(item => {
                const itemLabel = typeof item.label === 'string' ? item.label : item.label.label;
                return item.kind === vscode.CompletionItemKind.Field && itemLabel === name;
            });
            return {
                name,
                type: fieldItem?.detail || 'interface{}'
            };
        });
    }
    // 计算正确的缩进
    const indentInfo = calculateProperIndent(document, position, outputChannel);
    const { fieldIndent } = indentInfo;
    outputChannel.appendLine(`使用的字段缩进: '${fieldIndent}' (长度: ${fieldIndent.length})`);
    // 按照定义顺序生成字段代码
    const fieldLines = [];
    for (const fieldDef of fieldDefinitions) {
        const fieldName = fieldDef.name;
        let fieldValue;
        if (existingFields.has(fieldName)) {
            // 使用已有值
            fieldValue = existingFields.get(fieldName);
            outputChannel.appendLine(`保留已有字段: ${fieldName} = ${fieldValue}`);
        }
        else {
            // 使用定义中的类型信息或从补全项中查找
            let fieldType = fieldDef.type;
            // 尝试从补全项中获取更详细的类型信息
            const fieldItem = completionItems.items.find(item => {
                const itemLabel = typeof item.label === 'string' ? item.label : item.label.label;
                return item.kind === vscode.CompletionItemKind.Field && itemLabel === fieldName;
            });
            if (fieldItem && fieldItem.detail) {
                fieldType = fieldItem.detail;
            }
            fieldValue = getDefaultValueByType(fieldType);
            addedFields.push(fieldName);
            outputChannel.appendLine(`添加新字段: ${fieldName} = ${fieldValue} (类型: ${fieldType})`);
        }
        fieldLines.push(`${fieldIndent}${fieldName}: ${fieldValue},`);
    }
    // 生成字段代码，不添加多余的换行符
    let code = '';
    if (fieldLines.length > 0) {
        code = fieldLines.join('\n');
    }
    outputChannel.appendLine(`生成的有序字段代码:\n"${code}"`);
    outputChannel.appendLine(`新添加的字段: [${addedFields.join(', ')}]`);
    return { code, addedFields };
}
/**
 * 计算正确的缩进信息 - 重新设计，更可靠地检测缩进
 */
function calculateProperIndent(document, position, outputChannel) {
    outputChannel.appendLine(`开始计算缩进，当前位置: ${position.line}:${position.character}`);
    // 获取当前行文本
    const currentLineText = document.lineAt(position.line).text;
    outputChannel.appendLine(`当前行文本: '${currentLineText}'`);
    // 获取当前行缩进
    const currentIndentMatch = currentLineText.match(/^(\s*)/);
    const currentIndent = currentIndentMatch ? currentIndentMatch[1] : '';
    outputChannel.appendLine(`当前行缩进: '${currentIndent}' (长度: ${currentIndent.length})`);
    // 向上查找开大括号行
    let braceLine = -1;
    let braceCharPos = -1;
    for (let i = position.line; i >= 0; i--) {
        const lineText = document.lineAt(i).text;
        const bracePos = lineText.indexOf('{');
        if (bracePos !== -1) {
            braceLine = i;
            braceCharPos = bracePos;
            break;
        }
    }
    outputChannel.appendLine(`找到开大括号行 ${braceLine}: '${braceLine >= 0 ? document.lineAt(braceLine).text : ''}'`);
    // 获取基础缩进
    let baseIndent = '';
    if (braceLine >= 0) {
        const lineText = document.lineAt(braceLine).text;
        const indentMatch = lineText.match(/^(\s*)/);
        baseIndent = indentMatch ? indentMatch[1] : '';
    }
    outputChannel.appendLine(`基础缩进: '${baseIndent}' (长度: ${baseIndent.length})`);
    // 分析缩进类型
    const useTabs = currentIndent.includes('\t');
    let fieldIndent;
    if (useTabs) {
        // 如果使用 tab，保持 tab 缩进
        fieldIndent = baseIndent + '\t';
    }
    else {
        // 如果使用空格，保持空格缩进
        const spaceCount = baseIndent.length;
        const indentSize = spaceCount % 4 === 0 ? 4 : 2;
        fieldIndent = baseIndent + ' '.repeat(indentSize);
    }
    outputChannel.appendLine(`使用${useTabs ? 'tab' : '空格'}缩进`);
    outputChannel.appendLine(`使用的字段缩进: '${fieldIndent}' (长度: ${fieldIndent.length})`);
    return { baseIndent, fieldIndent };
}
/**
 * 直接从当前光标位置附近分析字段缩进
 */
function analyzeDirectFieldIndent(document, position, outputChannel) {
    outputChannel.appendLine('尝试直接分析字段缩进');
    // 向上和向下查找最近的字段行
    const searchRange = 10; // 搜索范围
    for (let offset = 0; offset <= searchRange; offset++) {
        // 向上查找
        if (offset > 0) {
            const upLine = position.line - offset;
            if (upLine >= 0) {
                const fieldIndent = extractFieldIndentFromLine(document, upLine, outputChannel);
                if (fieldIndent) {
                    return fieldIndent;
                }
            }
        }
        // 向下查找
        const downLine = position.line + offset;
        if (downLine < document.lineCount) {
            const fieldIndent = extractFieldIndentFromLine(document, downLine, outputChannel);
            if (fieldIndent) {
                return fieldIndent;
            }
        }
    }
    outputChannel.appendLine('直接分析未找到有效缩进');
    return null;
}
/**
 * 从指定行提取字段缩进信息
 */
function extractFieldIndentFromLine(document, lineNum, outputChannel) {
    const lineText = document.lineAt(lineNum).text;
    const trimmed = lineText.trim();
    // 检查是否是有效的字段行
    if (trimmed.includes(':') && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        const fieldMatch = trimmed.match(/^(\w+)\s*:\s*/);
        if (fieldMatch) {
            const indentMatch = lineText.match(/^(\s*)/);
            const fieldIndent = indentMatch ? indentMatch[1] : '';
            outputChannel.appendLine(`在行 ${lineNum} 找到字段: '${lineText.trim()}'`);
            outputChannel.appendLine(`提取的缩进: '${fieldIndent}' (长度: ${fieldIndent.length})`);
            // 计算基础缩进（通常是字段缩进减去一个tab或若干空格）
            let baseIndent = '';
            if (fieldIndent.endsWith('\t')) {
                baseIndent = fieldIndent.slice(0, -1);
            }
            else if (fieldIndent.length >= 4 && fieldIndent.endsWith('    ')) {
                baseIndent = fieldIndent.slice(0, -4);
            }
            else if (fieldIndent.length >= 2 && fieldIndent.endsWith('  ')) {
                baseIndent = fieldIndent.slice(0, -2);
            }
            return {
                baseIndent: baseIndent,
                fieldIndent: fieldIndent
            };
        }
    }
    return null;
}
/**
 * 分析缩进类型（tab或空格）
 */
function analyzeIndentType(indent) {
    if (indent.includes('\t')) {
        const tabCount = (indent.match(/\t/g) || []).length;
        const spaceCount = indent.replace(/\t/g, '').length;
        return `${tabCount} tabs + ${spaceCount} spaces`;
    }
    else {
        return `${indent.length} spaces`;
    }
}
/**
 * 根据字段类型获取默认值
 */
function getDefaultValueByType(fieldType) {
    // 如果是指针类型，返回 nil
    if (fieldType.startsWith('*')) {
        return 'nil';
    }
    // 处理基本类型
    const type = fieldType.replace('*', '').toLowerCase();
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
            if (fieldType) {
                return `${fieldType}{}`;
            }
            return '""';
    }
}
/**
 * 直接从结构体定义中获取字段的正确顺序
 * 这比依赖补全项顺序更可靠
 */
async function getStructFieldDefinitionOrder(structName, document, outputChannel) {
    outputChannel.appendLine(`开始获取结构体 ${structName} 的定义顺序`);
    try {
        // 首先在当前文件中查找结构体定义
        const currentFileText = document.getText();
        const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*{([^}]+)}`, 's');
        let match = structRegex.exec(currentFileText);
        if (match) {
            outputChannel.appendLine(`在当前文件中找到结构体定义: ${structName}`);
            return parseStructFieldsFromDefinition(match[1], outputChannel);
        }
        // 如果当前文件没有，搜索工作区的所有.go文件
        const goFiles = await vscode.workspace.findFiles('**/*.go', null, 50);
        for (const file of goFiles) {
            if (file.fsPath === document.uri.fsPath) {
                continue; // 跳过当前文件，已经搜索过了
            }
            try {
                const fileDoc = await vscode.workspace.openTextDocument(file);
                const fileText = fileDoc.getText();
                const match = structRegex.exec(fileText);
                if (match) {
                    outputChannel.appendLine(`在文件 ${file.fsPath} 中找到结构体定义: ${structName}`);
                    return parseStructFieldsFromDefinition(match[1], outputChannel);
                }
            }
            catch (error) {
                // 忽略单个文件的错误，继续搜索
                outputChannel.appendLine(`搜索文件 ${file.fsPath} 时出错: ${error}`);
            }
        }
        outputChannel.appendLine(`未找到结构体 ${structName} 的定义`);
        return [];
    }
    catch (error) {
        outputChannel.appendLine(`获取结构体定义时出错: ${error}`);
        return [];
    }
}
/**
 * 解析结构体字段定义文本，提取字段名称和类型，保持原始顺序
 * 过滤掉 protobuf 生成的结构体中的不可访问字段
 */
function parseStructFieldsFromDefinition(fieldsText, outputChannel) {
    const fields = [];
    // 清理文本，移除多余的空白和注释
    const cleanText = fieldsText
        .replace(/\/\/.*$/gm, '') // 移除行注释
        .replace(/\/\*[\s\S]*?\*\//g, '') // 移除块注释
        .trim();
    outputChannel.appendLine(`解析结构体字段文本:\n${cleanText}`);
    // 按行分割并解析每个字段
    const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    // 定义不可访问的字段名称（protobuf 生成的内部字段）
    const inaccessibleFields = new Set([
        'state',
        'unknownFields',
        'sizeCache',
        'XXX_unrecognized',
        'XXX_sizecache',
        'XXX_NoUnkeyedLiteral',
        'XXX_unrecognized',
        'XXX_sizecache',
        'XXX_InternalExtensions',
        'XXX_extensions'
    ]);
    for (const line of lines) {
        // 匹配字段定义：FieldName Type `tags`
        // 支持多种格式：
        // 1. Name string `json:"name"`
        // 2. Age int
        // 3. Items []Item
        // 4. Map map[string]int
        const fieldMatch = line.match(/^(\w+)\s+([^\s`]+)/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1];
            const fieldType = fieldMatch[2];
            // 过滤掉不可访问的字段
            if (inaccessibleFields.has(fieldName)) {
                outputChannel.appendLine(`跳过不可访问字段: ${fieldName} (类型: ${fieldType})`);
                continue;
            }
            // 过滤掉以小写字母开头的私有字段
            if (fieldName[0] === fieldName[0].toLowerCase()) {
                outputChannel.appendLine(`跳过私有字段: ${fieldName} (类型: ${fieldType})`);
                continue;
            }
            fields.push({
                name: fieldName,
                type: fieldType
            });
            outputChannel.appendLine(`解析到字段: ${fieldName} (类型: ${fieldType})`);
        }
    }
    outputChannel.appendLine(`总共解析到 ${fields.length} 个可访问字段，顺序: [${fields.map(f => f.name).join(', ')}]`);
    return fields;
}
function analyzeExistingIndent(document, position, outputChannel) {
    outputChannel.appendLine(`开始分析现有缩进，当前位置: ${position.line}:${position.character}`);
    // 获取当前行和周围几行的文本
    const lines = [];
    for (let i = Math.max(0, position.line - 2); i <= position.line + 2; i++) {
        if (i < document.lineCount) {
            lines.push(document.lineAt(i).text);
        }
    }
    outputChannel.appendLine('分析的行:');
    lines.forEach((line, index) => {
        outputChannel.appendLine(`行 ${index}: '${line}'`);
    });
    // 查找左大括号行
    let braceLineIndex = -1;
    let braceLineText = '';
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('{')) {
            braceLineIndex = i;
            braceLineText = lines[i];
            break;
        }
    }
    if (braceLineIndex === -1) {
        outputChannel.appendLine('未找到左大括号行，使用默认缩进');
        return { baseIndent: '', fieldIndent: '\t' };
    }
    // 提取左大括号行的缩进
    const braceIndentMatch = braceLineText.match(/^(\s*)/);
    const baseIndent = braceIndentMatch ? braceIndentMatch[1] : '';
    outputChannel.appendLine(`左大括号行缩进: '${baseIndent}' (长度: ${baseIndent.length})`);
    // 查找字段行
    let fieldIndent = '';
    for (let i = braceLineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(':') && !line.trim().startsWith('//')) {
            const fieldIndentMatch = line.match(/^(\s*)/);
            if (fieldIndentMatch) {
                fieldIndent = fieldIndentMatch[1];
                outputChannel.appendLine(`找到字段行缩进: '${fieldIndent}' (长度: ${fieldIndent.length})`);
                break;
            }
        }
    }
    // 如果没有找到字段行，使用左大括号行缩进 + 一个缩进单位
    if (!fieldIndent) {
        const indentType = analyzeIndentType(baseIndent);
        if (indentType.includes('tabs')) {
            fieldIndent = baseIndent + '\t';
        }
        else {
            // 检查是否使用2个或4个空格
            const spaceCount = baseIndent.length;
            const indentSize = spaceCount % 4 === 0 ? 4 : 2;
            fieldIndent = baseIndent + ' '.repeat(indentSize);
        }
        outputChannel.appendLine(`使用计算的字段缩进: '${fieldIndent}'`);
    }
    return {
        baseIndent: baseIndent,
        fieldIndent: fieldIndent
    };
}
function analyzeIndentFromContext(document, position, outputChannel) {
    outputChannel.appendLine(`开始分析上下文缩进，当前位置: ${position.line}:${position.character}`);
    // 向上查找非空行
    let currentLine = position.line;
    while (currentLine >= 0) {
        const lineText = document.lineAt(currentLine).text;
        if (lineText.trim() !== '') {
            outputChannel.appendLine(`找到非空行 ${currentLine}: '${lineText}'`);
            // 检查是否是变量初始化
            if (lineText.match(/^\s*[\w\.]+\s*(?::=|=|:)\s*(?:&?[\w\.]+|\[\]|map\[string\])/)) {
                outputChannel.appendLine('检测到变量初始化行');
                const indentMatch = lineText.match(/^(\s*)/);
                const baseIndent = indentMatch ? indentMatch[1] : '';
                // 分析缩进类型
                const useTabs = baseIndent.includes('\t');
                let fieldIndent;
                if (useTabs) {
                    fieldIndent = baseIndent + '\t';
                }
                else {
                    // 检查是否使用2个或4个空格
                    const spaceCount = baseIndent.length;
                    const indentSize = spaceCount % 4 === 0 ? 4 : 2;
                    fieldIndent = baseIndent + ' '.repeat(indentSize);
                }
                outputChannel.appendLine(`变量初始化行缩进: '${baseIndent}' (使用${useTabs ? 'tab' : '空格'})`);
                outputChannel.appendLine(`计算的字段缩进: '${fieldIndent}'`);
                return { baseIndent, fieldIndent, useTabs };
            }
            // 检查是否是字段行
            if (lineText.match(/^\s*\w+\s*:/)) {
                outputChannel.appendLine('检测到字段行');
                const indentMatch = lineText.match(/^(\s*)/);
                const fieldIndent = indentMatch ? indentMatch[1] : '';
                const useTabs = fieldIndent.includes('\t');
                // 向上查找变量初始化行来获取基础缩进
                let baseIndent = '';
                for (let i = currentLine - 1; i >= 0; i--) {
                    const prevLine = document.lineAt(i).text;
                    if (prevLine.match(/^\s*[\w\.]+\s*(?::=|=|:)\s*(?:&?[\w\.]+|\[\]|map\[string\])/)) {
                        const baseIndentMatch = prevLine.match(/^(\s*)/);
                        baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';
                        break;
                    }
                }
                outputChannel.appendLine(`字段行缩进: '${fieldIndent}' (使用${useTabs ? 'tab' : '空格'})`);
                outputChannel.appendLine(`基础缩进: '${baseIndent}'`);
                return { baseIndent, fieldIndent, useTabs };
            }
        }
        currentLine--;
    }
    // 如果没有找到合适的行，使用默认缩进
    outputChannel.appendLine('未找到合适的行，使用默认缩进');
    return { baseIndent: '', fieldIndent: '\t', useTabs: true };
}
function analyzeIndentInfo(document, position, outputChannel) {
    outputChannel.appendLine(`开始分析缩进信息，当前位置: ${position.line}:${position.character}`);
    // 向上查找非空行
    let currentLine = position.line;
    while (currentLine >= 0) {
        const lineText = document.lineAt(currentLine).text;
        if (lineText.trim() !== '') {
            outputChannel.appendLine(`找到非空行 ${currentLine}: '${lineText}'`);
            // 获取缩进
            const indentMatch = lineText.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';
            // 分析缩进类型和大小
            const useTabs = indent.includes('\t');
            let indentSize = 0;
            if (useTabs) {
                // 计算 tab 数量
                indentSize = (indent.match(/\t/g) || []).length;
                outputChannel.appendLine(`检测到 tab 缩进，数量: ${indentSize}`);
            }
            else {
                // 计算空格数量
                indentSize = indent.length;
                outputChannel.appendLine(`检测到空格缩进，数量: ${indentSize}`);
            }
            // 检查是否是变量初始化
            if (lineText.match(/^\s*[\w\.]+\s*(?::=|=|:)\s*(?:&?[\w\.]+|\[\]|map\[string\])/)) {
                outputChannel.appendLine('检测到变量初始化行');
                const baseIndent = indent;
                let fieldIndent;
                if (useTabs) {
                    fieldIndent = baseIndent + '\t';
                }
                else {
                    fieldIndent = baseIndent + ' '.repeat(indentSize);
                }
                return {
                    type: useTabs ? 'tab' : 'space',
                    size: indentSize,
                    baseIndent,
                    fieldIndent
                };
            }
            // 检查是否是字段行
            if (lineText.match(/^\s*\w+\s*:/)) {
                outputChannel.appendLine('检测到字段行');
                const fieldIndent = indent;
                // 向上查找变量初始化行来获取基础缩进
                let baseIndent = '';
                for (let i = currentLine - 1; i >= 0; i--) {
                    const prevLine = document.lineAt(i).text;
                    if (prevLine.match(/^\s*[\w\.]+\s*(?::=|=|:)\s*(?:&?[\w\.]+|\[\]|map\[string\])/)) {
                        const baseIndentMatch = prevLine.match(/^(\s*)/);
                        baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';
                        break;
                    }
                }
                return {
                    type: useTabs ? 'tab' : 'space',
                    size: indentSize,
                    baseIndent,
                    fieldIndent
                };
            }
        }
        currentLine--;
    }
    // 如果没有找到合适的行，使用默认缩进
    outputChannel.appendLine('未找到合适的行，使用默认缩进');
    return {
        type: 'tab',
        size: 1,
        baseIndent: '',
        fieldIndent: '\t'
    };
}
//# sourceMappingURL=extension.js.map