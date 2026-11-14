# -*- coding: utf-8 -*-
"""
把一份「复习站」单文件 HTML 转成「复研」存档：
  <out>/manifest.json  <out>/content.html  <out>/questions.json

用法：
  python build_archive.py infectious
  python build_archive.py digestive
  python build_archive.py all
"""
import io
import json
import os
import re
import shutil
import sys
import time

from lxml import html as LH

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
DATA = os.path.join(APP, "data", "archives")

SITES = {
    "infectious": {
        "src": r"D:\学习资料\传染病\复习综合站.html",
        "out": "infectious",
        "title": "传染病学",
        "subtitle": "期末复习综合站",
        "version": "1.3.0",
        "nav_sel": "//nav[@id='nav']",
        "badge_sel": ".//span[contains(@class,'ic')]",
        "count_sel": ".//em[contains(@class,'qmeta')]",
        "sec_prefix": "sec-",
        "chrome": [
            "//aside[contains(@class,'side')]",
            "//div[contains(@class,'topbar')]",
            "//aside[@id='ask']",
            "//div[@id='ask-mask']",
            "//div[@id='sel-bubble']",
            "//div[@id='save-modal']",
            "//section[@id='sec-quiz']",
        ],
        "drop_nav": ["quiz"],
        "theme": {"bg": "#f6f5f1", "panel": "#fffefb", "ink": "#1d2430", "muted": "#6b7280"},
        "accent": "#0f766e",
        "css_fix": """
/* ---- 存档内嵌修正（去掉外壳后） ---- */
.side{display:none!important}
.main{max-width:none!important;padding:0 34px 80px!important}
.sec{display:block!important;animation:none!important}
body{min-height:0!important}
section[id],.know-item{scroll-margin-top:16px}
#sec-home h1{margin-top:18px}
""",
    },
    "digestive": {
        "src": r"D:\学习资料\消化系统\消化系统疾病\消化系统_复习综合站_v2_完整版.html",
        "out": "digestive",
        "title": "消化系统",
        "subtitle": "临床推理复习站",
        "version": "2.0.0",
        "nav_sel": "//nav[contains(@class,'side-nav')]",
        "badge_sel": ".//span[1]",
        "count_sel": None,
        "sec_prefix": "",
        "chrome": [
            "//div[contains(@class,'reading-progress')]",
            "//aside[contains(@class,'sidebar')]",
            "//div[contains(@class,'topbar')]",
            "//button[@id='backTop']",
            "//section[@id='bank']",
        ],
        "drop_nav": ["bank"],
        "theme": {"bg": "#f7f3ea", "panel": "#fffdf7", "ink": "#1e1e14", "muted": "#6b6b5e"},
        "accent": "#bd5238",
        "css_fix": """
/* ---- 存档内嵌修正（去掉侧栏后） ---- */
.shell{margin-left:0!important}
.sidebar{display:none!important}
.topbar{display:none!important}
main{padding-top:26px!important}
section[id],article[id],.module h3[id]{scroll-margin-top:16px}
""",
    },
}


# ---------------------------------------------------------------- helpers
def norm_space(s):
    return re.sub(r"\s+", " ", s or "").strip()


def drop(node):
    if node is not None and node.getparent() is not None:
        node.drop_tree()


def text_of(el, drop_xpaths):
    """element 的文本，但去掉 drop_xpaths 命中的子节点（XPath）"""
    clone = LH.fromstring(LH.tostring(el, encoding="unicode"))
    for xp in drop_xpaths:
        for d in clone.xpath(xp):
            drop(d)
    return norm_space(clone.text_content())


def style_text(doc):
    return "\n".join((s.text or "") for s in doc.xpath("//style"))


# ---------------------------------------------------------------- nav
def extract_nav(doc, cfg, section_ids, counts):
    nav = doc.xpath(cfg["nav_sel"])
    if not nav:
        raise SystemExit("找不到导航容器：%s" % cfg["nav_sel"])
    nav = nav[0]
    items = []
    for child in nav.iterchildren():
        if not isinstance(child.tag, str):
            continue
        cls = child.get("class") or ""
        if child.tag == "div" and ("grp" in cls or "label" in cls):
            items.append({"group": norm_space(child.text_content())})
            continue
        if child.tag != "a":
            continue
        href = child.get("href") or ""
        anchor = href[1:] if href.startswith("#") else (child.get("data-sec") or "")
        if not anchor or anchor in cfg["drop_nav"]:
            continue
        drops = []
        if cfg.get("badge_sel"):
            drops.append(cfg["badge_sel"])
        if cfg.get("count_sel"):
            drops.append(cfg["count_sel"])
        title = text_of(child, drops)
        badge = ""
        if cfg.get("badge_sel"):
            b = child.xpath(cfg["badge_sel"])
            if b:
                badge = norm_space(b[0].text_content())
        item = {
            "anchor": anchor,
            "title": title,
            "badge": badge,
            "sectionId": section_ids.get(anchor),
        }
        n = counts.get(anchor)
        if n:
            item["count"] = n
        items.append(item)
    return items


# ---------------------------------------------------------------- html
def annotate_actions(doc):
    """给原站的交互控件加 data-act，runtime 只认 data-act。"""
    def mark(xp, act, **attrs):
        for el in doc.xpath(xp):
            el.set("data-act", act)
            for k, v in attrs.items():
                el.set(k, v)

    mark("//*[@id='qa-all']", "expand-all", **{"data-scope": "#qa-list .qa"})
    mark("//*[@id='qa-none']", "collapse-all", **{"data-scope": "#qa-list .qa"})
    mark("//*[@id='case-all']", "expand-all", **{"data-scope": "#case-list .qa"})
    mark("//*[@id='case-none']", "collapse-all", **{"data-scope": "#case-list .qa"})
    mark("//*[@id='naming-quiz']", "flip-mode")
    mark("//*[@id='naming-reset']", "shuffle")
    mark("//div[contains(@class,'quick-tabs')]//button[@data-qt]", "tab")

    for card in doc.xpath("//div[contains(@class,'card')][@data-id]"):
        cid = card.get("data-id")
        for m in card.xpath(".//*[contains(concat(' ',normalize-space(@class),' '),' mark ')]"):
            m.set("data-act", "mastered")
            m.set("data-key", cid)

    mark("//button[contains(@class,'filter-btn')][@data-filter]", "filter-flash",
         **{"data-target": "#flashGrid"})
    for b in doc.xpath("//button[contains(@class,'master-btn')][@data-master]"):
        b.set("data-act", "module-mastered")
        b.set("data-key", "m" + (b.get("data-master") or ""))
    for b in doc.xpath("//button[@data-mode]"):
        b.set("data-act", "seg")
        b.set("data-target", "compare")


def build_content(doc, cfg, dropped_sections):
    body = doc.xpath("//body")[0]
    for xp in cfg["chrome"]:
        for node in doc.xpath(xp):
            drop(node)
    for sid in dropped_sections:
        for node in doc.xpath("//*[@id='%s']" % sid):
            drop(node)
    for s in doc.xpath("//script"):
        drop(s)
    for sec in doc.xpath("//section"):
        cls = (sec.get("class") or "").split()
        if "sec" in cls and "active" not in cls:
            sec.set("class", (sec.get("class") or "") + " active")
    # 原站用于站内搜索的 data-s（内容被截断、引号未转义）：删掉，改用本软件的检索
    for el in doc.xpath("//*[@data-s]"):
        el.attrib.pop("data-s", None)
    # 名解卡里的 markdown 粗体残留 **…**：清掉
    for el in doc.xpath("//div[contains(concat(' ',normalize-space(@class),' '),' card ')]"):
        for t in el.iter():
            if t.text and "**" in t.text:
                t.text = t.text.replace("**", "")
            if t.tail and "**" in t.tail:
                t.tail = t.tail.replace("**", "")
    annotate_actions(doc)
    for node in doc.xpath("//div[contains(@class,'toast')]"):
        drop(node)
    return "".join(LH.tostring(c, encoding="unicode", method="html") for c in body)


# ---------------------------------------------------------------- quiz
def find_quiz_json(doc):
    for xp in ("//script[@id='quiz-data']", "//script[@id='quizData']",
               "//script[@id='quiz']", "//script[@type='application/json']"):
        for el in doc.xpath(xp):
            txt = (el.text or "").strip()
            if txt.startswith("[") or txt.startswith("{"):
                return txt
    return None


def normalize_question(q, idx):
    def g(*keys):
        for k in keys:
            v = q.get(k)
            if v not in (None, ""):
                return v
        return None

    typ = (g("type") or "single").lower()
    tmap = {
        "single": "single", "single_choice": "single", "choice": "single", "单选": "single",
        "multi": "multi", "multi_choice": "multi", "multiple": "multi", "不定项": "multi", "多选": "multi",
        "judge": "truefalse", "true_false": "truefalse", "truefalse": "truefalse", "判断": "truefalse",
        "fill": "fill", "fill_blank": "fill", "填空": "fill",
        "explain": "explain", "名词解释": "explain",
        "short": "short", "short_answer": "short", "简答": "short",
    }
    qtype = tmap.get(typ, "single")

    stem = g("stem_zh", "stem", "stemZh", "question") or ""
    stem_en = g("stem_en", "stemEn")
    out_opts = []
    for o in (q.get("options") or []):
        if isinstance(o, dict):
            out_opts.append({"zh": o.get("zh") or o.get("text") or o.get("label") or "",
                             "en": o.get("en") or None})
        else:
            out_opts.append({"zh": str(o), "en": None})

    ans = q.get("answer")
    answer = []
    answer_text = None
    if isinstance(ans, list):
        if ans and all(isinstance(x, (int, float)) or (isinstance(x, str) and x.strip().isdigit()) for x in ans):
            answer = sorted(int(x) for x in ans)
        else:
            answer_text = [str(x) for x in ans]
    elif isinstance(ans, (int, float)):
        answer = [int(ans)]
    elif isinstance(ans, str):
        s = ans.strip()
        if s.upper() in ("正确", "对", "TRUE", "T", "√"):
            answer_text = ["true"]
        elif s.upper() in ("错误", "错", "FALSE", "F", "×"):
            answer_text = ["false"]
        elif re.fullmatch(r"[A-Ea-e]+", s):
            answer = sorted({ord(c.upper()) - 65 for c in s})
        else:
            answer_text = [s]

    tags = q.get("tags") or []
    if isinstance(tags, str):
        tags = [t for t in re.split(r"[,，;；\s]+", tags) if t]
    return {
        "id": str(q.get("id") or "q%04d" % (idx + 1)),
        "type": "multi" if (qtype == "single" and len(answer) > 1) else qtype,
        "topic": q.get("topic") or q.get("chapter") or "",
        "tags": tags,
        "src": q.get("src") or q.get("source") or "",
        "stem": stem,
        "stemEn": stem_en,
        "options": out_opts,
        "answer": answer,
        "answerText": answer_text,
        "explain": q.get("explain") or q.get("explanation") or "",
        "raw": None,
    }


def extract_questions(doc):
    txt = find_quiz_json(doc)
    if not txt:
        return []
    data = json.loads(txt)
    if isinstance(data, dict):
        data = data.get("questions") or data.get("data") or []
    out = []
    for i, q in enumerate(data):
        nq = normalize_question(q, i)
        if nq["stem"]:
            out.append(nq)
    return out


# ---------------------------------------------------------------- counts
def compute_counts(doc, cfg, quiz):
    counts = {}
    if cfg["out"] == "infectious":
        counts["naming"] = len(doc.xpath("//div[contains(@class,'card')][@data-id]"))
        counts["qa"] = len(doc.xpath("//*[@id='qa-list']//div[contains(concat(' ',normalize-space(@class),' '),' qa ')]"))
        counts["case"] = len(doc.xpath("//*[@id='case-list']//div[contains(concat(' ',normalize-space(@class),' '),' qa ')]"))
        counts["quiz"] = len(quiz)
    else:
        counts["naming"] = len(doc.xpath("//button[contains(@class,'flashcard')]"))
        counts["shorts"] = len(doc.xpath("//*[@id='shorts']//details[contains(@class,'reveal')]"))
        counts["cases"] = len(doc.xpath("//article[contains(@class,'case-card')]"))
        counts["bank"] = len(quiz)
    return counts


# ---------------------------------------------------------------- main
def build(site_key):
    cfg = SITES[site_key]
    raw = io.open(cfg["src"], encoding="utf-8").read()
    doc = LH.document_fromstring(raw)
    quiz = extract_questions(doc)

    all_sections = [s.get("id") for s in doc.xpath("//section[@id]")]
    section_ids = {}
    for a in re.findall(r'href="#([^"]+)"', raw):
        for cand in (cfg["sec_prefix"] + a, a):
            if cand in all_sections:
                section_ids[a] = cand
                break

    counts = compute_counts(doc, cfg, quiz)
    nav = extract_nav(doc, cfg, section_ids, counts)

    dropped = []
    for a in cfg["drop_nav"]:
        for cand in (cfg["sec_prefix"] + a, a):
            if cand in all_sections and cand not in dropped:
                dropped.append(cand)

    body_html = build_content(doc, cfg, dropped)
    styles = style_text(doc)

    out = os.path.join(DATA, cfg["out"])
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)

    content = """<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s · %(subtitle)s</title>
<style>%(styles)s</style>
<style id="fuyan-embed-fix">%(fix)s</style>
</head>
<body data-archive="%(id)s">
%(body)s
</body>
</html>
""" % {"title": cfg["title"], "subtitle": cfg["subtitle"], "styles": styles,
       "fix": cfg["css_fix"], "id": cfg["out"], "body": body_html}
    io.open(os.path.join(out, "content.html"), "w", encoding="utf-8").write(content)

    questions = {"schema": "fuyan/questions@1", "count": len(quiz), "questions": quiz}
    io.open(os.path.join(out, "questions.json"), "w", encoding="utf-8").write(
        json.dumps(questions, ensure_ascii=False, indent=1))

    topics, tags, types = [], [], []
    for q in quiz:
        if q["topic"] and q["topic"] not in topics:
            topics.append(q["topic"])
        for t in q["tags"]:
            if t not in tags:
                tags.append(t)
        if q["type"] not in types:
            types.append(q["type"])

    manifest = {
        "schema": "fuyan/archive@1",
        "id": cfg["out"],
        "title": cfg["title"],
        "subtitle": cfg["subtitle"],
        "version": cfg["version"],
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "accent": cfg["accent"],
        "theme": cfg["theme"],
        "nav": nav,
        "quiz": {"total": len(quiz), "topics": topics, "tags": tags, "types": types},
        "source": {"kind": "local", "file": os.path.basename(cfg["src"]), "quarkPath": None},
    }
    io.open(os.path.join(out, "manifest.json"), "w", encoding="utf-8").write(
        json.dumps(manifest, ensure_ascii=False, indent=1))

    print("[ok] %-12s 导航 %d 项 · 计数 %s · 题库 %d · content %.0f KB"
          % (cfg["out"], len([n for n in nav if "anchor" in n]), counts, len(quiz),
             os.path.getsize(os.path.join(out, "content.html")) / 1024))


if __name__ == "__main__":
    args = sys.argv[1:] or ["all"]
    if args == ["all"]:
        for k in SITES:
            build(k)
    else:
        for a in args:
            build(a)
