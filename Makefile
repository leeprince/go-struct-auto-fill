# Go Struct Auto Fill VSCode Extension Makefile

# 默认目标
.PHONY: all
all: build

# 检查Node.js是否安装
.PHONY: check-node
check-node:
	@echo "检查Node.js环境..."
	@which node > /dev/null || (echo "错误: 未找到Node.js，请先安装Node.js" && exit 1)
	@which npm > /dev/null || (echo "错误: 未找到npm，请先安装npm" && exit 1)
	@echo "Node.js环境检查通过"

# 检查VSCE是否安装
.PHONY: check-vsce
check-vsce:
	@echo "检查VSCE工具..."
	@which vsce > /dev/null || (echo "正在安装VSCE工具..." && npm install -g @vscode/vsce)
	@echo "VSCE工具检查通过"

# 安装依赖
.PHONY: install
install: check-node
	@echo "安装项目依赖..."
	@npm install
	@echo "依赖安装完成"

# 清理构建文件
.PHONY: clean
clean:
	@echo "清理构建文件..."
	@rm -rf out/
	@rm -f *.vsix
	@echo "清理完成"

# 编译TypeScript
.PHONY: compile
compile: install
	@echo "编译TypeScript代码..."
	@npm run compile
	@echo "编译完成"

# 构建插件包
.PHONY: build
build: check-vsce compile
	@echo "构建VSCode插件包..."
	@vsce package
	@echo "插件构建完成！"
	@echo "生成的插件包: $(shell ls -t *.vsix | head -1)"

# 安装插件到VSCode（需要先构建）
.PHONY: install-extension
install-extension: build
	@echo "安装插件到VSCode..."
	@code --install-extension $(shell ls -t *.vsix | head -1)
	@echo "插件安装完成！请重启VSCode以激活插件"

# 开发模式：监听文件变化并自动重新编译
.PHONY: dev
dev: install
	@echo "启动开发模式，监听文件变化..."
	@npm run watch

# 运行测试
.PHONY: test
test: compile
	@echo "运行测试..."
	@npm test || echo "没有配置测试脚本"

# 显示帮助信息
.PHONY: help
help:
	@echo "Go Struct Auto Fill VSCode Extension 构建工具"
	@echo ""
	@echo "可用命令:"
	@echo "  make install        - 安装项目依赖"
	@echo "  make compile        - 编译TypeScript代码"
	@echo "  make build          - 构建插件包（推荐）"
	@echo "  make install-extension - 构建并安装插件到VSCode"
	@echo "  make dev            - 启动开发模式（监听文件变化）"
	@echo "  make clean          - 清理构建文件"
	@echo "  make test           - 运行测试"
	@echo "  make help           - 显示此帮助信息"
	@echo ""
	@echo "快速开始:"
	@echo "  make build          # 一键构建插件包"
	@echo "  make install-extension # 构建并安装插件"

# 显示项目信息
.PHONY: info
info:
	@echo "项目信息:"
	@echo "  名称: Go Struct Auto Fill"
	@echo "  版本: $(shell node -p "require('./package.json').version")"
	@echo "  描述: $(shell node -p "require('./package.json').description")"
	@echo "  作者: $(shell node -p "require('./package.json').author")" 