#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_library.py — 把欧洲研究资料库 01/02/03 的文献资料按「政策库」方法镜像进网站
用法: python3 build_library.py
行为:
  1. 遍历 01_中欧关系与对华政策 / 02_欧盟贸易协定全集 / 03_欧盟航天法研究文献
  2. 跳过: 99_临时文件 / 04_论文稿 / 私人笔记(初步分析、方法可行性) / .git / .DS_Store / 抓取日志
  3. PDF ≤3MB 直拷; >3MB 用 ghostscript /ebook 压缩(取较小者)
  4. .md 转为带统一样式的 .html(python-markdown)，排除重复快照和无正文占位页
  5. 按资料类型与精简主题分类生成 library_data.js，合并已核验的文献元数据
  6. 全站导航: 「智库文摘」→「文献库」; 删除 essays.html
"""
import os, re, sys, json, hashlib, shutil, subprocess, html as htmllib

ROOT = os.path.expanduser("~/Desktop/欧洲研究资料库")
REPO = os.path.join(ROOT, "04_中欧经贸交锋追踪/ICES政策数据库")
LIBDIR = os.path.join(REPO, "library")
COLLS = [
    ("01_中欧关系与对华政策", "01", "中欧关系"),
    ("02_欧盟贸易协定全集", "02", "贸易协定"),
    ("03_欧盟航天法研究文献", "03", "航天法"),
]
SKIP_DIR_PAT = re.compile(r"(99_临时|04_论文稿|抓取日志|\.git)")
SKIP_FILE_PAT = re.compile(r"(初步分析|方法可行性|论文稿|^\.|~\$)")

# —— 私货清洗: 文摘是给老板私人研究用的, 上站前剥掉私人段落 ——
PRIVATE_HEAD = re.compile(r"(老板|论文|待补|备忘|使用指引)")
PRIVATE_LINE = re.compile(r"老板|小天天|舒天|邓舒天|崔老师|崔洪建|咱们|爪爪|待补")

def sanitize_md(text):
    """删除含私人标记的章节(从该标题到下一个同级或更高级标题), 并逐行过滤残余。"""
    out, drop, base = [], False, 0
    for ln in text.split("\n"):
        hm = re.match(r"^(#{1,6})\s*(.*)", ln)
        if hm:
            lv = len(hm.group(1))
            if drop and lv <= base:
                drop = False
            if PRIVATE_HEAD.search(hm.group(2)):
                drop, base = True, lv
                continue
        if not drop and not PRIVATE_LINE.search(ln):
            out.append(ln)
    return "\n".join(out)

# —— 抓取工作流元数据剥离: 只留文件本体信息, 去掉抓取过程记录 ——
WORKFLOW_ANY = re.compile(r"抓取日期|抓取时间|抓取方式|获取状态|kimi_fetch|kimi-|scrape|一次成功")
WORKFLOW_CELL = re.compile(r"[✅❌⚠️✔✓☑⏳]|已获取|未获取|待抓|抓取成功|抓取失败|HTTP\s?码?[:：]?\s?\d{3}|状态.*获取")

def strip_crawl_meta(text):
    """非表格行整行剥离; 表格行剥到单元格级(保文件名与链接, 去状态列)。"""
    out = []
    for ln in text.split("\n"):
        s = ln.strip()
        if s.startswith("|") and "|" in s[1:]:
            cells = [c for c in ln.split("|") if not (WORKFLOW_ANY.search(c) or WORKFLOW_CELL.search(c))]
            ln2 = "|".join(cells)
            if ln2.strip().strip("|").strip():
                out.append(ln2)
            continue
        if WORKFLOW_ANY.search(ln):
            continue
        if ("状态" in ln or "获取" in ln) and WORKFLOW_CELL.search(ln):
            continue
        ln = re.sub(r"（[^）]*(?:kimi_fetch|抓取|一次成功)[^）]*）", "", ln)
        out.append(ln)
    return "\n".join(out)

# —— 原件优先: 02 收藏夹里, 有官方 PDF 原件的转写 MD 不上站 ——
OFFICIAL_MD = re.compile(r"(正文|全文|_L1|_L2|协定|公约|议定书)", re.I)
def _norm_stem(s):
    s = s.lower()
    s = re.sub(r"^\d+[a-z]?_", "", s)
    s = re.sub(r"(正文全文|正文|全文|agreement|协定文本)", "", s, flags=re.I)
    return re.sub(r"[_\-\s()（）]", "", s)
def _digits(s):
    """数字串: 去前导零, 只留 ≥2 位的(滤掉 01_/L1/L2 等序号污染)"""
    out = []
    for d in re.findall(r"\d+", s):
        d = d.lstrip("0") or "0"
        if len(d) >= 2:
            out.append(d)
    return out
def find_pdf_twin(dirpath, stem, include_html=True):
    """同目录下存在对应官方原件(名称归一化包含 或 ≥2个数字串互含)则返回 True。
    单一年份不算数——防止 1999 年协议被 2002 年决定误伤。"""
    exts = (".pdf", ".html") if include_html else (".pdf",)
    pdfs = [os.path.splitext(f)[0] for f in os.listdir(dirpath) if f.lower().endswith(exts)]
    a = _norm_stem(stem)
    da = _digits(stem)
    for p in pdfs:
        b = _norm_stem(p)
        if a and b and min(len(a), len(b)) >= 4 and (a in b or b in a):
            return True
        db = _digits(p)
        matched = sum(1 for x in da if any(x in y or y in x for y in db))
        if matched >= 2:
            return True
    return False
GS = "/usr/local/bin/gs"
COMPRESS_THRESHOLD = 3 * 1024 * 1024  # 3MB

INST_PRETTY = {
    "EPRS": "欧洲议会研究处", "Bruegel": "布鲁盖尔研究所", "SWP": "SWP·德国国际与安全事务研究所",
    "Elcano": "埃尔卡诺皇家研究所", "TNI": "跨国研究所", "AtlanticCouncil": "大西洋理事会",
    "CSIS": "CSIS·战略与国际研究中心", "ECIPE": "欧洲国际政治经济中心",
    "LSECEP": "LSE经济绩效中心", "UKICE": "英国变化欧洲研究所", "OECD": "经合组织",
    "USCC": "美中经济与安全评估委员会", "ETNC": "欧洲追踪中国网络(ETNC)", "Egmont": "埃格蒙特研究所",
    "FOR": "东方研究中心(OSW)", "Bertelsmann": "贝塔斯曼基金会", "CNAS": "新美国安全中心",
    "ECPR": "欧洲政治研究联合会", "IHS": "IHS马凯特",
}
KEYWORD_TAGS = ["Mercosur", "CETA", "CAI", "关税同盟", "脱欧", "航天", "空间", "出口管制", "反倾销",
                "反补贴", "外国补贴", "FSR", "经济安全", "去风险", "峰会", "议会", "理事会", "讲话",
                "声明", "白皮书", "战略", "供应链", "尽职调查", "数据安全", "AI", "人工智能", "地理标志",
                "投资", "补贴", "贸易救济", "电动汽车", "稀土", "两用物项", "瓦森纳", "技术转移"]

def md5(s): return hashlib.md5(s.encode()).hexdigest()[:8]

def clean_seg(seg):
    """去掉目录名前缀编号: 01_战略与政策文件 -> 战略与政策文件 ; 03b_新加坡投资保护协定 -> 新加坡投资保护协定"""
    s = re.sub(r"^\d+[a-z]?_", "", seg)
    s = re.sub(r"（[^）]*\d{4}[^）]*）$", "", s)
    s = re.sub(r"\s*-\s*$", "", s)
    return s.strip()

def guess_date(name):
    m = re.search(r"(20\d{2}|19\d{2})[-_.年](\d{1,2})[-_.月](\d{1,2})", name)
    if m: return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(?<!\d)(20\d{2}|19\d{2})(?!\d)", name)
    return m.group(1) if m else ""

def guess_side(coll, rel, name):
    p = rel + "/" + name
    if coll == "03": return "INTL"
    if re.search(r"中国|中方|国新办|商务部|新华社|中国威胁论|中国冲击|香港|澳门|台湾", p): return "CN"
    if re.search(r"欧洲|欧盟|EU|欧委会|欧洲议会|欧理会|EUCO|EUR-Lex|欧盟委员会|理事会结论|战略展望", p): return "EU"
    if coll == "02": return "EU"
    return "INTL"

def classify(coll, rel, name):
    p = rel + "/" + name
    segs = [clean_seg(s) for s in rel.split("/")[1:] if clean_seg(s)]
    if re.search(r"MASTER_INDEX|文件清单|INDEX\.md", name):
        return "清单索引", "清单索引"
    if coll == "01":
        if "中国官方文件" in segs:
            i = segs.index("中国官方文件")
            topic = segs[i + 1] if i + 1 < len(segs) else "综合政策"
            return "中方官方 / " + topic, "官方文件"
        if "智库报告" in segs:
            i = segs.index("智库报告")
            topic = segs[i + 1] if i + 1 < len(segs) else "综合研究"
            return "智库研究 / " + topic, "智库报告"
        if "学术研究" in segs:
            i = segs.index("学术研究")
            topic = segs[i + 1] if i + 1 < len(segs) else "综合研究"
            return "学术研究 / " + topic, "学术论文"
        if segs and segs[0] == "中国威胁论与中国冲击2.0":
            topic = segs[-1] if len(segs) > 1 else "综合研究"
            return "国际研究与舆论 / " + topic, "研究报告"
        topic = segs[-1] if len(segs) > 1 else "综合政策"
        return "欧盟对华政策 / " + topic, "官方文件"
    if coll == "02":
        for root, label, doctype in (("智库研究精选", "智库研究", "智库报告"), ("学术研究精选", "学术研究", "学术论文")):
            if root in segs:
                i = segs.index(root)
                topic = segs[i + 1] if i + 1 < len(segs) else "综合研究"
                topic = {"加拿大CETA": "CETA", "中国CAI": "中欧CAI", "UK_TCA": "英国脱欧"}.get(topic, topic)
                return label + " / " + topic.replace("_", " "), doctype
        if "党团与机构立场文件" in segs:
            return "党团与机构立场", "立场文件"
        if segs and segs[0] == "L4扩展包":
            return "扩展协定 / " + (segs[1].replace("_", " ") if len(segs) > 1 else "综合"), "协定文本"
        if segs:
            topic = segs[1].replace("_", " ") if len(segs) > 1 else "综合"
            doctype = "官方文件" if re.search(r"(?:^|_)L2|Council|理事会.*决定|批准决定|缔结决定", name, re.I) else "协定文本"
            return segs[0] + " / " + topic, doctype
        return "贸易协定", "协定文本"
    if coll == "03":
        if "学术文献" in segs:
            return "学术研究 / " + ("中文研究" if "中文文献" in segs else "外文研究"), "学术论文"
        if "智库报告" in segs:
            return "智库研究", "智库报告"
        if "官方文件" in segs:
            topic = {"欧盟官方文件": "欧盟机构", "联合国空间法条约": "联合国条约", "第三国与中国官方文件": "第三国与中国"}.get(segs[-1], "综合")
            return "官方文件 / " + topic, "官方文件"
    return "其他", "研究报告"

def is_placeholder_html(src):
    text = open(src, encoding="utf-8", errors="ignore").read()
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", text)
    text = re.sub(r"(?s)<[^>]+>", "", text)
    return len(htmllib.unescape(text).strip()) < 800

def guess_inst(name):
    m = re.match(r"([A-Za-z][A-Za-z&-]*?)_(\d{4})_", name)
    if m:
        tok = m.group(1)
        return INST_PRETTY.get(tok, tok)
    if re.search(r"_raw_|^\d{4}/", name) or re.search(r"\(\d{2}\)", name): return "EUR-Lex·欧盟官方公报"
    if "欧洲议会" in name or "EP_" in name: return "欧洲议会"
    if re.search(r"理事会结论|欧洲理事会", name): return "欧洲理事会"
    if "欧委会" in name or "委员会" in name: return "欧盟委员会"
    if "国新办" in name or "新华社" in name: return "中方官方"
    return ""

def build_tags(coll, collname, rel, name):
    tags, seen = [], set()
    def add(t):
        t = t.strip()
        if t and t not in seen and len(tags) < 8:
            seen.add(t); tags.append(t)
    add(collname)
    for seg in rel.split("/")[1:]:
        c = clean_seg(seg)
        if c and c != collname and not re.match(r"^\d", c): add(c)
    p = rel + "/" + name
    for kw in KEYWORD_TAGS:
        if kw in p: add(kw)
    return tags

def compress_pdf(src, dst):
    tmp = dst + ".gs.pdf"
    try:
        r = subprocess.run([GS, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dPDFSETTINGS=/ebook",
                            "-dNOPAUSE", "-dQUIET", "-dBATCH", f"-sOutputFile={tmp}", src],
                           capture_output=True, timeout=180)
        if r.returncode == 0 and os.path.exists(tmp):
            so, sd = os.path.getsize(tmp), os.path.getsize(src)
            if so < sd:
                shutil.move(tmp, dst); return "gs", so, sd
        if os.path.exists(tmp): os.remove(tmp)
    except Exception:
        if os.path.exists(tmp): os.remove(tmp)
    shutil.copy2(src, dst)
    return "raw", os.path.getsize(src), os.path.getsize(src)

MD_CSS = ("body{font-family:-apple-system,'PingFang SC',serif;max-width:820px;margin:40px auto;padding:0 24px;"
          "color:#211d18;line-height:1.9;font-size:15px}h1,h2,h3{font-family:'Songti SC',STSong,serif}"
          "h1{font-size:26px;border-bottom:2px solid #DA7756;padding-bottom:10px}h2{font-size:20px;margin-top:32px}"
          "h3{font-size:17px;margin-top:24px}table{border-collapse:collapse;width:100%;font-size:13px;margin:16px 0}"
          "th,td{border:1px solid #d8d0c0;padding:7px 10px;text-align:left}th{background:#efe9dd}"
          "code{background:#efe9dd;padding:1px 5px;border-radius:2px;font-size:13px}"
          "blockquote{border-left:3px solid #DA7756;margin-left:0;padding-left:14px;color:#575046}"
          "a{color:#b85a3c}hr{border:none;border-top:1px solid #d8d0c0;margin:28px 0}")

# —— 官方网页快照: 剥 script/iframe(第三方JS常带 API key/secret, GitHub secret-scanning 会拒收) ——
def sanitize_html_snapshot(src, tgt):
    html = open(src, encoding="utf-8", errors="ignore").read()
    html = re.sub(r"(?is)<script.*?>.*?</script>", "", html)
    html = re.sub(r"(?is)<noscript.*?>.*?</noscript>", "", html)
    html = re.sub(r"(?is)<iframe.*?>.*?</iframe>", "", html)
    with open(tgt, "w", encoding="utf-8") as f:
        f.write(html)

def md_to_html(src, dst, title):
    import markdown
    with open(src, encoding="utf-8") as f: text = f.read()
    text = sanitize_md(text)      # 私人段落剥离
    text = strip_crawl_meta(text) # 抓取工作流元数据剥离
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "nl2br"])
    doc = f'<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>{htmllib.escape(title)}</title><style>{MD_CSS}</style></head><body>{body}</body></html>'
    with open(dst, "w", encoding="utf-8") as f: f.write(doc)

def main():
    entries, skipped, comp_log, removed = [], [], [], []
    meta_path = os.path.join(REPO, "library_metadata.json")
    metadata = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    for dirname, cid, cname in COLLS:
        base = os.path.join(ROOT, dirname)
        for dirpath, dirnames, filenames in os.walk(base):
            rel_dir = os.path.relpath(dirpath, base)
            dirnames[:] = [d for d in dirnames if not SKIP_DIR_PAT.search(d)]
            for fn in sorted(filenames):
                if SKIP_FILE_PAT.search(fn) or fn == ".DS_Store": continue
                ext = os.path.splitext(fn)[1].lower()
                if ext not in (".pdf", ".md", ".html"): continue
                src = os.path.join(dirpath, fn)
                rel = os.path.join(dirname, rel_dir) if rel_dir != "." else dirname
                stem = os.path.splitext(fn)[0]
                title = re.sub(r"^\d{4}[-_.年]\d{1,2}[-_.月]\d{1,2}[日_]?\s*", "", stem)
                title = re.sub(r"^\d+[a-z]?_", "", title).strip()
                date = guess_date(fn)
                size = os.path.getsize(src)
                # 目标路径
                sub = os.path.relpath(dirpath, base)
                tgt_dir = os.path.join(LIBDIR, cid + cname, sub) if sub != "." else os.path.join(LIBDIR, cid + cname)
                os.makedirs(tgt_dir, exist_ok=True)
                # 伪PDF检测: 内容实为网页快照的 .pdf 改按 HTML 收录
                real_ext = ext
                if ext == ".pdf":
                    with open(src, "rb") as fh:
                        if fh.read(5) != b"%PDF-": real_ext = ".html"
                fmt = "pdf" if real_ext == ".pdf" else "html"
                tgt_name = fn if real_ext == ".pdf" else stem + ".html"
                tgt = os.path.join(tgt_dir, tgt_name)
                if real_ext == ".html" and ext == ".pdf" and os.path.exists(os.path.join(tgt_dir, fn)):
                    os.remove(os.path.join(tgt_dir, fn))  # 清理旧伪PDF残留
                mode = "raw"; so = sd = size
                if ext == ".html" and (find_pdf_twin(dirpath, stem, include_html=False) or is_placeholder_html(src)):
                    if os.path.exists(tgt): os.remove(tgt)
                    removed.append(rel.replace(os.sep, "/") + "/" + fn)
                    continue
                # 原件优先: 02 收藏夹的官方文本 MD, 若同目录有对应官方原件(PDF/快照)则弃用 MD
                if ext == ".md" and cid == "02" and OFFICIAL_MD.search(fn) and find_pdf_twin(dirpath, stem):
                    # 勿删同名网页快照: 快照与 MD 的生成目标路径相同, 快照是真原件要留
                    if os.path.exists(tgt) and not any(f == stem + ".html" for f in os.listdir(dirpath)):
                        os.remove(tgt)
                    removed.append(rel.replace(os.sep, "/") + "/" + fn)
                    continue
                if ext == ".md":
                    md_to_html(src, tgt, title)
                elif real_ext == ".html":
                    sanitize_html_snapshot(src, tgt)
                elif os.path.exists(tgt) and os.path.getmtime(tgt) >= os.path.getmtime(src):
                    mode = "cached"
                elif real_ext == ".pdf":
                    if size > COMPRESS_THRESHOLD:
                        mode, so, sd = compress_pdf(src, tgt)
                        comp_log.append((fn, sd, so, mode))
                    else:
                        shutil.copy2(src, tgt)
                if fmt == "html" and is_placeholder_html(tgt):
                    os.remove(tgt)
                    removed.append(rel.replace(os.sep, "/") + "/" + fn)
                    continue
                web_path = "library/" + cid + cname + ("/" + sub.replace(os.sep, "/") if sub != "." else "") + "/" + tgt_name
                category, doctype = classify(cid, rel, fn)
                e = {
                    "id": md5(dirname + "/" + (rel_dir if rel_dir != "." else "") + "/" + fn),
                    "title": title or stem, "date": date,
                    "year": date[:4] if date else "",
                    "side": guess_side(cid, rel, fn),
                    "coll": cid, "collName": cname,
                    "cat": category,
                    "type": doctype,
                    "inst": guess_inst(fn),
                    "tags": build_tags(cid, cname, rel if "/" in rel else "/" + fn, fn),
                    "file": web_path.replace(os.sep, "/"),
                    "fmt": fmt, "sizeKB": round(os.path.getsize(tgt) / 1024),
                    "src": (dirname + ("/" + rel_dir if rel_dir != "." else "") + "/" + fn).replace(os.sep, "/"),
                }
                meta = metadata.get(fn)
                if meta:
                    e["title"] = meta["title"]
                    e["authors"] = meta.get("author", "")
                    e["inst"] = meta.get("institution") or meta.get("journal") or e["inst"]
                    e["year"] = meta.get("year", e["year"])
                    e["date"] = meta.get("year", e["date"])
                entries.append(e)
    entries.sort(key=lambda x: (x["coll"], x["date"] or "9999", x["title"]))
    # 写数据
    with open(os.path.join(REPO, "library_data.js"), "w", encoding="utf-8") as f:
        f.write("const LIB=" + json.dumps(entries, ensure_ascii=False) + ";\n")
    # 导航更新
    nav_old = '<a href="essays.html" data-pg="essays">智库文摘</a>'
    nav_new = '<a href="library.html" data-pg="library">文献库</a>'
    for pg in ("index.html", "policies.html", "stats.html"):
        p = os.path.join(REPO, pg)
        with open(p, encoding="utf-8") as f: c = f.read()
        c2 = c.replace(nav_old, nav_new)
        if pg == "index.html":
            c2 = c2.replace('<a class="btn-ghost" href="stats.html">数据总览</a>',
                            '<a class="btn-ghost" href="library.html">文献库</a>\n    <a class="btn-ghost" href="stats.html">数据总览</a>')
        with open(p, "w", encoding="utf-8") as f: f.write(c2)
    essays = os.path.join(REPO, "essays.html")
    if os.path.exists(essays): os.remove(essays)
    # 摘要
    lib_size = sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fs in os.walk(LIBDIR) for f in fs)
    print(json.dumps({
        "entries": len(entries),
        "by_coll": {cid: sum(1 for e in entries if e["coll"] == cid) for _, cid, _ in COLLS},
        "by_fmt": {"pdf": sum(1 for e in entries if e["fmt"] == "pdf"), "html": sum(1 for e in entries if e["fmt"] == "html")},
        "gs_compressed": sum(1 for c in comp_log if c[3] == "gs"),
        "library_MB": round(lib_size / 1024 / 1024, 1),
        "removed_duplicates_and_placeholders": len(removed),
        "skipped": skipped,
    }, ensure_ascii=False, indent=1))
    if removed:
        print("--- 跳过的重复或占位条目 ---")
        for r in removed: print("  -", r)
    if comp_log:
        print("--- gs 压缩明细(前20) ---")
        for fn, sd, so, m in comp_log[:20]:
            print(f"  {m}  {sd//1024}KB -> {so//1024}KB  {fn[:60]}")

if __name__ == "__main__":
    main()
