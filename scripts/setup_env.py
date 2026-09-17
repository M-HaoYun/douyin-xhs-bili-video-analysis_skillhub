# -*- coding: utf-8 -*-
"""
本 skill 环境检查与首次配置
用法:
    python setup_env.py --check        # 只检查
    python setup_env.py --fix          # 自动补齐缺失（能装则装，装不上给出指引）
输出一份 <outputDir>/_env_report.txt 说明当前环境是否就绪。
"""
import os
import sys
import subprocess
import shutil

REPORT = []


def log(msg):
    print(msg)
    REPORT.append(msg)


def which(name):
    return shutil.which(name)


def check_node_playwright():
    log('--- Node & Playwright ---')
    # playwright-scraper-skill 自带 node_modules（历史环境）
    cand_skill = os.path.expanduser('~/.workbuddy/skills/playwright-scraper-skill__skillhub/node_modules')
    node_bins = [
        os.path.expanduser('~/.workbuddy/binaries/node/versions/22.22.2-2/node.exe'),
        'node',
    ]
    node_exe = None
    for n in node_bins:
        try:
            r = subprocess.run([n, '--version'], capture_output=True, text=True, timeout=10)
            if r.returncode == 0:
                node_exe = n
                break
        except Exception:
            continue
    if node_exe:
        log(f'node: {node_exe} -> {subprocess.run([node_exe, "--version"], capture_output=True, text=True).stdout.strip()}')
        if os.path.isdir(cand_skill):
            log(f'playwright node_modules: {cand_skill} (存在)')
            return node_exe, cand_skill
        else:
            log('playwright node_modules: ❌ 未找到')
            log('  需要安装：npm install playwright（本项目 headless 使用需 chromium）')
    else:
        log('node: ❌ 未找到。请安装 Node.js ≥18 或恢复 ~/.workbuddy/binaries/node')
    return node_exe, (cand_skill if os.path.isdir(cand_skill) else None)


def check_whisper():
    log('--- Whisper 转写 ---')
    # 优先用 whisper-transcribe skill 的定位器 config
    cfg_path = os.path.expanduser('~/.workbuddy/config/whisper-transcribe.json')
    if os.path.exists(cfg_path):
        cfg = json_load(cfg_path)
        py = cfg.get('python', '')
        if py and os.path.exists(py):
            log(f'whisper venv python: {py} (config 已配置)')
            r = subprocess.run([py, '-c', 'import faster_whisper, ctranslate2; print("OK")'],
                               capture_output=True, text=True, timeout=60)
            log('  faster-whisper 可用' if r.returncode == 0 else f'  ❌ 导入失败: {(r.stderr or "")[-200:]}')
            return py
    # 尝试自动探测持久 venv
    for cand in [
        os.path.expanduser('~/python-envs/whisper/Scripts/python.exe'),
        'D:/AI/python-envs/whisper/Scripts/python.exe',
        os.path.expanduser('~/.workbuddy/python-envs/whisper/Scripts/python.exe'),
    ]:
        if os.path.exists(cand):
            log(f'whisper venv python 探测到: {cand}')
            return cand
    log('whisper venv: ❌ 未找到（转写功能不可用）')
    log('  安装指引：用 Python ≥3.12（勿用 3.14，无 ctranslate2 wheel）创建持久 venv：')
    log('    <py3.12> -m venv D:/AI/python-envs/whisper')
    log('    D:/AI/python-envs/whisper/Scripts/python.exe -m pip install faster-whisper av')
    return None


def json_load(p):
    import json
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('--check', '--fix'):
        print(__doc__)
        sys.exit(1)
    node_exe, nm = check_node_playwright()
    whisper_py = check_whisper()
    log('--- 结论 ---')
    ok = True
    if not (node_exe and nm):
        log('❌ Playwright 环境未就绪 → 视频抓取不可用')
        ok = False
    else:
        log('✅ Playwright 环境就绪')
    if whisper_py:
        log('✅ Whisper 转写环境就绪（可选，用于拿不到字幕时音频转写）')
    else:
        log('⚠️ Whisper 转写不可用（视频若拿不到字幕/画面无文字，将无法做内容总结）')
    # 输出报告文件
    out = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
    with open(os.path.join(out, '_env_report.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(REPORT))
    sys.exit(0 if ok else 2)


if __name__ == '__main__':
    main()
