---
name: douyin-xhs-bili-video-analysis
description: 跨平台视频分析（抖音/小红书/B站）。当用户丢来一个抖音/小红书/B站分享链接并希望总结视频内容、分析爆款原因、解析流量、生成视频解读报告、或想知道怎么做同款/引流变现时使用；也适用于用户想知道"当前哪个平台热度最高/实时热榜有什么、想抓在榜头部视频做拆解"的场景。本技能会先判断内容类型（爆款娱乐类 vs 知识长视频类），按对应流程抓取元数据/字幕/画面，产出"内容总结+爆款机制+可复用公式+低成本做同款"报告；无单条链接时可用热榜发现流程（抖音实时热搜/热点视频榜）定位头部视频。
agent_created: true
---

也可直接在腾讯skillhub下载：https://skillhub.cn/skills/user_e285fd2e/douyin-xhs-bili-video-analysis

# 跨平台视频分析（抖音 / 小红书 / B站）

## 触发场景

用户提供以下任一种分享链接，并希望：
- **总结视频内容**（这个视频讲了什么）
- **分析爆点/爆款原因**（为什么它能火）
- **帮助做同款**（低成本复刻、蹭热门、涨曝光、引流变现）

或者**没有具体链接**，只想知道：
- **当前热度最高的视频/热搜话题**（实时热榜，再挑头部视频深拆）→ 走 §1.6 热榜发现流程

```
抖音：    https://v.douyin.com/xxxx/    或 抖音分享口令
小红书：  https://xhslink.cn/o/xxxx      或 https://xhslink.com/xxxx
B站：     https://b23.tv/xxxx
```

## 0. 前置环境（首次使用先跑一次）

```bash
python <本skill目录>/scripts/setup_env.py --check
```

需要两套环境（缺啥装啥，见"环境安装与踩坑"）：

| 环境 | 用途 | 装不上怎么办 |
|---|---|---|
| **Node ≥18 + playwright + chromium** | 打开页面抓接口/截帧（抖音/小红书/B站通用）| 见下文 §9-1 |
| **Python venv：faster-whisper**（可选）| 拿不到字幕时做音频转写（B站知识类视频核心）| 见下文 §9-2 |

## 1. 第一步永远先判断类型（决定目录、流程、报告规格）

**先看元数据再动工**：标题/作者/平台分区（B站 jsonld genre / 抖音分类）/时长/关键词。

| 类型 | 判断特征 | 报告目录 | 报告重点 |
|---|---|---|---|
| **爆款类**（搞笑/鬼畜/剧情/萌宠/猎奇）| 短(<5min)、分区=鬼畜/搞笑/生活、标题空格断字【郝 哥 不 在】、关键词含"二创/搞笑" | `爆款分析\` | 内容拆解 + 五层爆款机制 + 可复用公式 + **低成本做同款实操** |
| **知识类**（影视解析/科普/评测/攻略/直播切片鸡汤）| 长(>8min)、UP 知识区/评测区、简介含参考文献、关键词含"解析/测评/推荐/为什么" | `视频解读\` | 内容总结(干货) + 章节结构 + 知识图谱 + 叙事手法 + **扩展节(延伸思考，标注非视频内容)** |

## 1.5 互动指纹速判（跨 14 样本提炼，2026-09-07）

**动手拆解前先看互动数据定指纹**——互动结构决定内容基因，报告的分析侧重点随之调整：

| 指纹 | 判据 | 用户心理 | 分析侧重 | 样本实证 |
|---|---|---|---|---|
| **分享型**（社交货币）| 分享/赞 ≥ 40%，甚至 >1 | "我要传给某个特定的人" | 情绪/梗/悬念机制、转发链路 | 金汤海鲜面 1.86×、饽饽山 1.92×、刚睡醒被问 3.1× |
| **收藏型**（价值沉淀）| 藏/赞 ≥ 10% 为强，≥50% 极端 | "先存下来以后照着做" | 清单/教程价值、可执行性 | 顶美公主 74.5%、米基小王 15% |
| **参与型**（表达欲）| 评/赞高 + 评论区自转 | "我想接一句/被看见" | 留白设问、互动钩子、评论生态 | 刚睡醒被问、郝哥不在(弹幕推理) |

**操作含义**：做同款分析时先指明目标指纹——想裂变做分享型（情绪/梗/悬念，放弃信息量）、想沉淀做收藏型（清单+数字承诺+行动项）、想互动做参与型（留白/提问/接力）。三路无高下，**混搭稀释指纹**。

## 1.6 热榜发现流程（无具体链接时的入口，抖音已跑通）

用户问"现在什么最火/热度最高的视频"且没有具体链接时走此流程：**抓榜单 → 精选在榜视频 → 转 §2 单链接深拆**。

### ① 抖音实时热榜（完全可拿，2026-09-07 实证）

```bash
# 抓取（产出 hot_words.json / hotspot.json / page.html / page.txt）
node douyin_hot.js <outputDir>
# 解析（热搜词榜 + 热点视频榜 + 页面在榜视频 id↔标题配对）
python douyin_hot_parse.py <outputDir>
```

**两个核心接口**（`https://www.douyin.com/hot` 页面加载时监听响应）：
- `aweme/v1/web/hot/search/list` → **实时热搜词榜**：`data.word_list` 51 条带 `hot_value`（热度值），按热度降序；**`word_type=14` 是置顶时政词，剔除**
- `aweme/v1/web/channel/hotspot?channel_id=99` → **热点视频精选流**：顶层 `aweme_list` 20 条带完整 stats（赞/评/藏/转）+ 时长。⚠️ 该响应 **400KB+，保存时勿截断**（截断会损坏 JSON）

**在榜视频 id↔标题配对**：热榜页 HTML 含 30 个 `/video/{aweme_id}` 链接；`page.txt`（渲染文本）按顺序含对应标题/"XX人在看"。**两者顺序一致**，逐个对齐即可得到"在榜视频清单（带标题与热度）"。

**精选原则**（结合用户账号定位挑 2-4 个最有拆解价值的在榜视频）：选"与用户内容赛道相关"（如 AI 号挑 #千问/#AI 相关视频）、"小号高赞"（素人起号参考）、"极端数据"（超高转发/超短时长/挑战赛）三类，转 §2.3 用 `douyin_probe.js` 深拆。

### ② 小红书实时热榜（游客拿不到，降级）

- `xiaohongshu.com/explore` 游客仅见登录墙+频道 Tab；`/api/sns/web/v1/search/hot` 需登录签名 → **当前无 cookie 则拿不到官方实时榜**
- **降级**：WebSearch 第三方复盘（千瓜数据 / NeoDrop 等公开报道），标注"非平台官方榜"
- 有用户提供有效 web session cookie 时再直跑官方接口

### ③ 抖音搜索页被墙（勿走此路）

游客访问 `douyin.com/search/{kw}` **body 为空**（搜索接口需登录）→ "热搜词→话题下视频"不能靠站内搜索，**只能走"热点视频"页面的在榜 id**。

## 2. 平台抓取流程

### 2.1 B站
```bash
# ① 短链 → BV号
curl -sL -o /dev/null -w "%{url_effective}" "https://b23.tv/xxxx" -A "Chrome UA"

# ② 抓元数据 + 监听接口（含 playurl/字幕）
node bili_probe.js <BV号> <outputDir>        # 产 meta.json / apis.json / page.html
# ③ 触发播放 → 捕获音频流 URL（页面默认不自动播放，必须点）
node bili_get_audio.js <BV号> <outputDir>     # 产 playurl.json / audio_url.txt
# ④ 下载音频
curl -H "Referer: https://www.bilibili.com/" -o audio.m4s "$(cat audio_url.txt)"
# ⑤ 知识类低密度截帧（时长自适应，封顶 ~24 帧）
node bili_frames_gen.js <BV号> <outputDir>
```
**元数据读取**：优先解析 page.html 里的 `video-jsonld`（application/ld+json，含 title/desc/duration/author/interactionStatistic/keywords/genre，最完整）。`view/cards` 接口已阉割只剩 contract，别依赖。

**字幕**：游客访问 `x/player/wbi/v2` 返回 `subtitles: []`（需登录）。**B站视频几乎都拿不到官方字幕 → 靠音频转写**（步骤③④+whisper 替代字幕）：把 audio.m4s 喂 whisper（§9-2）拿完整解说词，精度远超帧内字幕。

### 2.2 小红书
```bash
# ① 短链 → 真实 URL（拿 noteId + xsec_token）
node xhs_probe.js "https://xhslink.cn/o/xxxx" <outputDir>   # 自动解短链+预热cookie+自动重试，存 page.html
# ② 解析 SSR（兼容多种嵌套路径）
python xhs_parse.py <outputDir>    # 提取 __INITIAL_STATE__ → 元数据/字幕URL/评论预览
# ③ 有字幕 URL 则直接下载（游客可拿！这是小红书优势）
curl -H "Referer: https://www.xiaohongshu.com/" -o zh.srt "<subtitle_url>"
# ④ 截帧/截图（画面验证，图文笔记则对图片元素逐个截图）
#    参照 bili_frames_gen.js 把页面 URL 换成 discovery/item/{noteId}?xsec_token=... 即可
```
**元数据来源**：`window.__INITIAL_STATE__`（HTML 内嵌，**需先正则 `undefined`→`null` 才能 json.loads**）。游客可拿：标题/话题/作者/赞藏评/发布时间/视频直链/字幕/部分评论预览。全量评论与主页需登录 cookie。

**🎯 关键能力**：小红书 ASR 字幕（AI 自动字幕）**游客可直链下载**！SSR `mediaV2.subtitles` 里有 `zh-CN` 和 `en-US` 的 srt URL，curl 带 Referer 即拿精确到秒的台词 → **不用截帧认字幕**。注意 mediaV2 里的 URL 是转义 JSON（`\/`），需还原。

**⚠️ 踩坑与解法（2026-09-07 实证）**：
- **症状**：游客直访笔记页偶发只拿到 6KB "打开小红书 App" 引导页 或 登录墙（HTML 无 `__INITIAL_STATE__`）
- **解法① 预热 cookie**：同一浏览器上下文**先访问 `xiaohongshu.com` 首页停留 4s，再访问笔记页**——能拿到完整 SSR（xhs_probe.js v2 已内置）
- **解法② 自动重试**：手机 UA 拿不到时自动换桌面 UA + stealth 再试（xhs_probe.js v2 已内置：先手机后桌面）
- **SSR 嵌套路径多变**：详情可能在 `note.noteDetailMap.{id}.note`，也可能在 `noteData.data.noteData`，还可能被递归嵌在别处——xhs_parse.py 已三级兼容（noteDetailMap → noteData → 递归 find）
- **作者昵称字段**可能是 `nickname` 或 `nickName`，两都要读
- **图片 CDN 直链 403**：小红书图片带防盗链，curl/python 直下 403——需在**已打开的浏览器页面内 fetch 下载**（带 cookie 凭证）或对 `<img>` 元素用 `element.screenshot()` 截取渲染结果

### 2.3 抖音
```bash
# 短链/aweme_id 通用
node douyin_probe.js "https://v.douyin.com/xxxx/" <outputDir>  # 详情+评论接口监听 + 自适应截帧
python douyin_parse.py <outputDir>    # 解析赞/评/藏/转/作者/话题/高赞评论
```
**元数据来源**：监听接口 `aweme/v1/web/aweme/detail`（详情：赞/评/藏/转/作者/时长/标签）+ `comment/list`（评论）。抖音无官方字幕 → 画面靠截帧认字，或下载视频音轨转写。

## 3. 画面截帧与视觉验证

- 短视频(<3min)：每 3-8s 一帧；中视频爆款类每 20-25s
- 长视频知识类：每 50-60s 一帧，**封顶 24 帧**（知识类靠字幕/转写，帧只是画面验证）
- 登录遮罩/弹窗：用 JS 隐藏 `div[class*="login"/mask/modal/dialog]` 再截
- 播放器视频截帧方式：`video.currentTime=t` + `video.screenshot()`（页面内嵌播放绕过 CDN 防盗链）
- 读帧后**逐帧描述画面内容**，视频分析必须"亲眼看到"再下结论，禁靠标题/评论猜画面

## 4. 报告产出规范（核心交付）

每个视频建独立文件夹：`<报告目录>\YYYYMMDD_<作者>_<主题>\`，内部分：
- `分析报告.md`（最终交付）
- `素材\`（中间产物：帧图/字幕/音频/页面）——**分析完成后删除素材目录，只留报告**

### 4.1 爆款类报告结构
```
# 视频标题
> 平台/时长/数据（赞/评/藏/转）· 作者 · 发布时间
## 内容总结（这条视频在做什么——剧情结构表）
## 数据剖析（各维度 + 同类对比）
## 爆款机制拆解（五层飞轮：情绪机制/结构/悬念/分享引擎/二创空间）
## 可复用的爆款公式（代码块：要素公式）
## 叙事手法分析
## 这条视频的价值
## 低成本做同款实操（选IP→加角色/改设定→还原节奏→上架细节→蹭热度窗口→涨曝光引流变现闭环 + 风险提示）
```

### 4.2 知识类报告结构
```
# 视频标题
> 平台/时长/数据 · 作者
## 🎯 内容总结（干货六层：UP 讲了什么，让读者看了就知道）
## 章节结构（按解说词精确时间轴）
## 核心知识图谱（概念关系图 + 表格）
## 叙事手法分析（讲复杂知识怎么讲清楚）
## 这条视频的价值（适合谁看/不可替代性/可借鉴角度）
## 同类可借鉴选题
## 🔍 扩展（延伸思考，非视频内容）   ← 客观表述，禁第一人称"我的/我对"
```

### 4.3 纪律（红线）
1. **报告只写内容价值**：禁止出现"本次发现 XX 接口/首次跑通 XX/数据-内容一体化"等抓取方法论自述（那是 agent 自己的知识，写进 MEMORY 即可）
2. **禁止个人路径/隐私**：示例一律用虚构路径（如 `D:/临时/会议录音.m4s`），报告不含 `C:\Users\<用户名>` 等本机路径；真实业务路径/案件名/人名一律不出现
3. **去掉两节**："数据来源可信度说明"和"原始素材存档"不要写进报告
4. **引用热梗先搜**：网络热梗引用前先 WebSearch 当月真实热梗，禁止编造
5. **知识类报告扩展节**：置于末尾，用「扩展（延伸思考，非视频内容）」标题，客观口吻（无"我的"），给用户补充深度视角

## 5. whisper 音频转写（知识类无字幕时）

```bash
# 模型策略（重要）：先用 base（快），转完抽查质检
# base 对英文型号/数字系列识别好；中文同音字易错但可读
# 若关键数字/专有名词错太多（如评测类价格数字漏识），再换 small 重转
<whisper-python> ~/.workbuddy/scripts/whisper_transcribe.py audio.m4s base transcript.txt
```

## 6. 完成后

- 删除该视频文件夹内的 `素材\`（帧图/音频/转写/页面），仅保留 `分析报告.md`
- present_files 展示报告

## 7. 平台通用工作流速查

```
热榜发现（无链接时入口，抖音）：
  douyin_hot.js 抓榜 → douyin_hot_parse.py 解析热搜/热点视频/在榜id ↔标题 → 按赛道精选2-4个
      → 转下两线用 douyin_probe.js 深拆

短视频爆款类（抖音/小红书/B站鬼畜）：
  短链 → 类型判断(爆款) → probe 抓接口+字幕+截帧(每3-8s) → 读帧理解 → 写爆款报告(含同款实操) → 删素材

长视频知识类（B站为主）：
  短链 → 类型判断(知识) → probe 抓元数据+音频URL → 下载音频 → whisper base转写→质检→(不行再small)
       → 低密度截帧(每50-60s) → 字幕/转写+帧交叉 → 写知识报告(内容总结+扩展) → 删素材
```

## 8. 常见问题与处理

| 症状 | 原因 | 处理 |
|---|---|---|
| 抖音搜索页 body 空白 | 游客搜索接口需登录 | 勿走搜索；改从 douyin.com/hot 热点视频页拿在榜 aweme_id（§1.6）|
| 抖音 hotspot 接口 JSON 损坏 | 响应 400KB+ 被截断保存 | douyin_hot.js 完整保存勿 slice；解析前确认文件尾部是 `}` |
| 小红书实时热榜拿不到 | web 接口需登录签名 | WebSearch 第三方复盘降级；或向用户要有效 cookie |
| 热搜词 word_type=14 混入榜首 | 置顶时政词 | 解析时剔除 word_type=14 |
| curl 直接抓 B站 API 返回 412 | B站 IP 风控 | 用 Playwright 浏览器上下文内 fetch/监听，不要 curl API |
| B站 playurl 不出现 | 视频不自动播放 | 先点击播放按钮再监听（bili_get_audio.js 已内置）|
| B站 x/player/wbi/v2 subtitles=[] | 游客无 AI 字幕 | 转音频用 whisper，不要等字幕 |
| 抖音 CDN 视频直链下载 403 | 防盗链 | 页面内嵌播放截帧，不下载直链 |
| 小红书 SSR 解析失败 | `undefined` 未清洗 或 游客被剥详情 | 清洗 `undefined`；详情路径三级兼容（xhs_parse.py 已处理）；若 HTML<50KB 无 SSR → 预热 cookie + 桌面 UA 重试（xhs_probe.js v2 已内置）|
| 小红书图片下载 403 | 图片 CDN 防盗链 | 浏览器页面内 fetch 下载，或对 `<img>` 元素 `element.screenshot()` |
| 知乎 403/登录墙 | 知乎游客强风控 | 需要用户提供登录 cookie（或放弃该平台）|
| 页面"登录/试看"遮罩 | 登录墙 | JS 隐藏遮罩不影响 video 元素 seek 截帧 |
| whisper venv 丢失 | 装在托管目录被清 | 用 setup_env.py --check；持久 venv 放 D 盘或 ~/python-envs |

## 9. 环境安装与踩坑（重要）

### 9-1 Node + Playwright
```bash
# 推荐：装到用户级/持久目录，勿装 .workbuddy/binaries（托管目录会被平台重置清空）
npm install playwright        # 或复用已装好的 playwright-scraper-skill 的 node_modules
npx playwright install chromium
# 运行脚本时设 NODE_PATH 指向 playwright node_modules：
#   NODE_PATH="<...>/node_modules" <node> douyin_probe.js ...
```

### 9-2 Whisper 本地转写（faster-whisper）
```bash
# ① 创建持久 venv
#    ⚠️ 不要用 .workbuddy/binaries 下的 python（托管目录会被重置清空）
#    ⚠️ 不要用 Python 3.14——ctranslate2/av 暂无 cp314 wheel（实测 pip 找不到）
#    用 Python 3.12 或 3.13（uv 缓存的 3.12.x 可用）
<py3.12> -m venv D:/AI/python-envs/whisper
# ② 安装依赖（清华镜像快）
D:/AI/python-envs/whisper/Scripts/python.exe -m pip install faster-whisper av -i https://pypi.tuna.tsinghua.edu.cn/simple
# ③ 下载模型到公共目录（勿用 huggingface_hub 缓存下载，本机沙箱会失败）
#    curl 直连 hf-mirror，需要 4 个文件：
#    config.json / model.bin(464MB,small|142MB,base) / tokenizer.json / vocabulary.txt
curl -L -o ~/.workbuddy/models/faster-whisper-small/config.json \
  https://hf-mirror.com/Systran/faster-whisper-small/resolve/main/config.json
curl -L -o ~/.workbuddy/models/faster-whisper-small/model.bin \
  https://hf-mirror.com/Systran/faster-whisper-small/resolve/main/model.bin
curl -L -o ~/.workbuddy/models/faster-whisper-small/tokenizer.json \
  https://hf-mirror.com/Systran/faster-whisper-small/resolve/main/tokenizer.json
curl -L -o ~/.workbuddy/models/faster-whisper-small/vocabulary.txt \
  https://hf-mirror.com/Systran/faster-whisper-small/resolve/main/vocabulary.txt
# ④ 转写脚本：~/.workbuddy/scripts/whisper_transcribe.py
#    模型目录固定：~/.workbuddy/models/faster-whisper-base|small
```

**"反复安装不上"的兜底指引**：若上面任一环装不上（如 pip 网络失败、wheel 不匹配、模型下载中断），停止重试，明确告知用户：
1. 需要装什么（包名/版本或模型文件名）
2. 官方下载源（pypi / hf-mirror URL）
3. 装好后放哪（venv 路径 / `~/.workbuddy/models/faster-whisper-*`）
让用户手动完成后，再跑 `setup_env.py --check` 验证。

### 9-3 踩坑记录（历史血泪）
- **依赖必须装持久位置**：`.workbuddy/binaries/` 是托管目录，平台会重置清空（实证：装好的 faster-whisper 全部丢失）。venv/模型放 D 盘数据区或用户级 Roaming
- **whisper venv 要求 Python ≤3.13**：3.14 无 ctranslate2/av 的 cp314 wheel（实测 pip 直接报错）
- **模型下载**：`https://hf-mirror.com/Systran/faster-whisper-<base|small>/resolve/main/<文件名>`，不要用 huggingface_hub 缓存机制（沙箱下会失败）
- **Windows dll**：ctranslate2 需要 `os.add_dll_directory()` 声明 dll 目录（转写脚本内置自动探测）
- **同音字校正**：whisper 输出需人工校正（专有名词/人名/价格数字易错），正式文本加注"个别同音字按上下文校正"
- **长音频耗时**：small 模型 CPU 约 1.5-2 倍实时（25min 音频 ≈ 12-15min），放后台跑；短音频直接 base
- **转写模型策略**：先 base 质检（英文型号/数字 OK，中文同音字略错但可读），关键数字/名词错太多才上 small——不要默认 small

## 10. 隐私与数据安全
- 本 skill 不含任何本机路径/个人信息，SKILL.md 只写相对路径与占位符
- 首次使用时 setup_env.py 会自动探测本机环境并写入 `~/.workbuddy/config/`（本机私有）
- 报告示例一律用虚构路径；不要用真实用户名/案件名/项目路径做示例
