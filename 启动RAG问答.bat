@echo off
chcp 65001 >nul
cd /d "%~dp0"
title RAG 问答系统

echo ========================================
echo   RAG 问答系统 - 正在启动...
echo ========================================
echo.
echo 首次启动需要加载知识库，请稍候
echo 浏览器将自动打开，请勿关闭此窗口
echo.

python app.py

if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请检查：
    echo   1. 是否已安装 Python
    echo   2. 是否已运行 pip install -r requirements.txt
    echo   3. .env 文件中是否配置了 DASHSCOPE_API_KEY
    echo.
    pause
)
