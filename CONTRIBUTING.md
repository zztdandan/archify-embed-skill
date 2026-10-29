# 参与

1. 改技能内容只动 `skills/archify-embed/`；版本同时更新 `VERSION` 与 `SKILL.md` 的 `version`。
2. 提交前跑：

   ```bash
   python3 scripts/validate_skills.py
   node --check skills/archify-embed/scripts/embed-runtime.js
   node --check skills/archify-embed/scripts/verify-embed.cjs
   ```

3. 新增坑点请写进 `references/pitfalls.md`，按「现象 → 成因 → 做法 → 验收」四段，
   并在 `README.md` 的表格里补一行。
4. 不提交密钥、内网地址、验收截图与本地环境文件。
