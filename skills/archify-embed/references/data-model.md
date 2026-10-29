# 外置文字 JSON 的结构

一份 JSON 管全部可改文字：正文、图内标签、逐节点详解。页面渲染时套用，
用户改完点"应用"即时生效，下载时写回文件。

```jsonc
{
  "formatVersion": 1,
  "report": {
    "category": "建设规划汇报",
    "title": "……",
    "lead": "开篇结论段……",
    "highlights": ["要点一", "要点二", "要点三"],
    "sections": [
      {
        "id": "overview",
        "title": "总体架构",
        "blocks": [
          { "type": "paragraph", "text": "……" },
          { "type": "diagram", "diagramId": "overview" },
          { "type": "table", "headers": ["环节", "内容"], "rows": [["资产登记", "……"]] }
        ]
      }
    ]
  },
  "diagrams": [
    {
      "id": "overview",
      "title": "图标题（同时作为阅读器大标题）",
      "caption": "图下方的说明",
      "summary": "整体说明，用于无选中时的卡片",
      "points": ["整体要点"],
      "initialNode": "m2",
      "nodes": {
        "m2": {
          "label": "节点名",
          "sublabel": "节点副标题",
          "tag": "节点脚注",
          "summary": "这个节点做什么",
          "points": ["职责一", "职责二"]
        }
      },
      "edges": { "m2-to-d": { "label": "连线文字", "description": "连线解释" } },
      "groups": { "group-0": { "label": "分区名" } }
    }
  ]
}
```

## 校验规则

| 规则 | 原因 |
|---|---|
| `formatVersion === 1` | 结构升级时能识别旧稿 |
| `diagrams` 的 id 集合与资产基线一致 | 少一张图页面就残缺 |
| `diagram.nodes` 的 key 集合 == 基线 `nodeIds` | 增删节点会让补丁找不到元素 |
| `diagram.edges` 的 key 集合 == 基线连线 id | 同上 |
| `diagram.groups` 的 key 集合 == 基线分区 id | 同上 |
| `initialNode` 必须是现有节点 | 卡片默认选中项 |
| 正文里每张图恰好出现一次 | 防止漏挂或重复挂 |
| 表格每行列数与表头一致 | 渲染不跑版 |

字符串统一 `textContent` 写入；序列化进 `<script>` 时把 `<` 换成 `\u003c`。

## 与应用/下载的关系

- **应用**：解析 → 校验 → 重建页面（重写 srcdoc 或就地改 iframe DOM）→ 同步隐藏的
  `#report-content` → 编辑器回填格式化后的 JSON。
- **下载**：把当前 JSON 写回克隆文档的 `#report-content`，清空渲染容器，再导出 Blob。
- **失败**：JSON 解析或校验失败时，保留原稿不动，只在状态行报错。
