#!/usr/bin/env python3
"""校验技能仓库：清单、版本、脚本语法、是否混入密钥。

用法：
    python3 scripts/validate_skills.py
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = ROOT / "skills"
VERSION_FILE = ROOT / "VERSION"
ROOT_SKILL_MD = ROOT / "SKILL.md"      # 与 skills/<name>/SKILL.md 不能并存

SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?$")
SECRET = re.compile(r"\b(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b")
INTERNAL_HOST = re.compile(r"\b(?:172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b")
REQUIRED = ("name", "description", "version", "license")


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("缺少 frontmatter")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter 未闭合")
    fields: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if not line or line[0] in " \t#-":
            continue
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields


def main() -> int:
    errors: list[str] = []
    version = VERSION_FILE.read_text().strip() if VERSION_FILE.is_file() else ""
    if not SEMVER.match(version):
        errors.append("VERSION 缺失或不是语义化版本")
    if ROOT_SKILL_MD.exists():
        errors.append("根目录不应有 SKILL.md（会破坏 skills/<name>/ 的发现）")
    if not SKILLS_DIR.is_dir():
        errors.append("缺少 skills/ 目录")
        print("\n".join(errors))
        return 1

    names = sorted(p.name for p in SKILLS_DIR.iterdir() if p.is_dir())
    if not names:
        errors.append("skills/ 下没有技能目录")

    for name in names:
        skill_md = SKILLS_DIR / name / "SKILL.md"
        if not skill_md.is_file():
            errors.append(f"{name}: 缺少 SKILL.md")
            continue
        try:
            fields = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
        except ValueError as exc:
            errors.append(f"{name}: {exc}")
            continue
        for key in REQUIRED:
            if not fields.get(key):
                errors.append(f"{name}: frontmatter 缺少 {key}")
        if fields.get("name") != name:
            errors.append(f"{name}: frontmatter name 与目录不一致")
        if fields.get("version") and fields["version"] != version:
            errors.append(f"{name}: 版本 {fields['version']} 与 VERSION {version} 不一致")

    # 脚本语法
    node = shutil.which("node")
    for js in sorted(SKILLS_DIR.rglob("*.js")) + sorted(SKILLS_DIR.rglob("*.cjs")):
        if ".git" in js.parts:
            continue
        if not node:
            errors.append("未找到 node，无法校验 JS 语法")
            break
        res = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
        if res.returncode != 0:
            errors.append(f"{js.relative_to(ROOT)}: {res.stderr.strip().splitlines()[0]}")

    # JSON 资源
    for js in sorted(SKILLS_DIR.rglob("*.json")):
        try:
            json.loads(js.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{js.relative_to(ROOT)}: JSON 解析失败 {exc}")

    # 密钥与内网地址
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.suffix.lower() in {".png", ".jpg", ".webp", ".gif", ".ico", ".pdf"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if SECRET.search(text):
            errors.append(f"{path.relative_to(ROOT)}: 疑似提交了密钥")
        if INTERNAL_HOST.search(text):
            errors.append(f"{path.relative_to(ROOT)}: 含内网地址")

    if errors:
        print("校验失败：")
        for e in errors:
            print(" -", e)
        return 1
    print(f"OK — {len(names)} 个技能，版本 {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
