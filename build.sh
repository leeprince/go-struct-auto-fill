#!/bin/bash

# Go Struct Auto Fill VSCode Extension 构建脚本

set -e  # 遇到错误时退出

echo "🚀 Go Struct Auto Fill 构建工具"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Node.js
check_node() {
    echo -e "${BLUE}检查Node.js环境...${NC}"
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: 未找到Node.js，请先安装Node.js${NC}"
        exit 1
    fi
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}错误: 未找到npm，请先安装npm${NC}"
        exit 1
    fi
    echo -e "${GREEN}Node.js环境检查通过${NC}"
}

# 检查VSCE
check_vsce() {
    echo -e "${BLUE}检查VSCE工具...${NC}"
    if ! command -v vsce &> /dev/null; then
        echo -e "${YELLOW}正在安装VSCE工具...${NC}"
        npm install -g @vscode/vsce
    fi
    echo -e "${GREEN}VSCE工具检查通过${NC}"
}

# 安装依赖
install_deps() {
    echo -e "${BLUE}安装项目依赖...${NC}"
    npm install
    echo -e "${GREEN}依赖安装完成${NC}"
}

# 编译代码
compile() {
    echo -e "${BLUE}编译TypeScript代码...${NC}"
    npm run compile
    echo -e "${GREEN}编译完成${NC}"
}

# 构建插件
build_extension() {
    echo -e "${BLUE}构建VSCode插件包...${NC}"
    vsce package
    echo -e "${GREEN}插件构建完成！${NC}"
    
    # 显示生成的插件包
    EXTENSION_FILE=$(ls -t *.vsix | head -1)
    if [ -n "$EXTENSION_FILE" ]; then
        echo -e "${GREEN}生成的插件包: $EXTENSION_FILE${NC}"
    fi
}

# 安装插件到VSCode
install_extension() {
    echo -e "${BLUE}安装插件到VSCode...${NC}"
    EXTENSION_FILE=$(ls -t *.vsix | head -1)
    if [ -n "$EXTENSION_FILE" ]; then
        code --install-extension "$EXTENSION_FILE"
        echo -e "${GREEN}插件安装完成！请重启VSCode以激活插件${NC}"
    else
        echo -e "${RED}未找到插件包文件${NC}"
        exit 1
    fi
}

# 清理构建文件
clean() {
    echo -e "${BLUE}清理构建文件...${NC}"
    rm -rf out/
    rm -f *.vsix
    echo -e "${GREEN}清理完成${NC}"
}

# 显示帮助
show_help() {
    echo "Go Struct Auto Fill VSCode Extension 构建脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  build             构建插件包（推荐）"
    echo "  install-extension 构建并安装插件到VSCode"
    echo "  clean             清理构建文件"
    echo "  help              显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 build           # 一键构建插件包"
    echo "  $0 install-extension # 构建并安装插件"
}

# 主函数
main() {
    case "${1:-build}" in
        "build")
            check_node
            check_vsce
            install_deps
            compile
            build_extension
            ;;
        "install-extension")
            check_node
            check_vsce
            install_deps
            compile
            build_extension
            install_extension
            ;;
        "clean")
            clean
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo -e "${RED}未知命令: $1${NC}"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@" 