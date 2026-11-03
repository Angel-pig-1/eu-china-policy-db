#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_library.py — 把欧洲研究资料库 01/02/03 的文献资料按「政策库」方法镜像进网站
用法: python3 build_library.py
行为:
  1. 遍历 01_中欧关系与对华政策 / 02_欧盟贸易协定全集 / 03_欧盟航天法研究文献
  2. 跳过: 99_临时文件 / 04_论文稿 / 私人笔记(初步分析、方法可行性) / .git / .DS_Store / 抓取日志
  3. PDF ≤3MB 直拷; >3MB 用 ghostscript /ebook 压缩(取较小者)
  4. .md 转为带统一样式的 .html(python-markdown)
  5. 生成 library_data.js + library.html(与政策库同一设计语言: 列表+详情+原文内嵌)
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
    s = re.sub(r"（[^）]*\d{4}[^）]*）$", "", s)  # 去掉尾部年份括注
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
    if coll == "02": return "EU"  # 欧盟对外协定
    return "INTL"

def guess_type(coll, rel, name):
    p = rel + "/" + name
    if "智库研究精选" in p: return "智库报告"
    if re.search(r"MASTER_INDEX|文件清单|INDEX\.md", name): return "清单索引"
    if coll == "02" and re.search(r"L1|L2|正文全文|全文|Agreement|_raw_|EPA|FTA|协定", p): return "协定文本"
    return "官方文件"

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

def md_to_html(src, dst, title):
    import markdown
    with open(src, encoding="utf-8") as f: text = f.read()
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "nl2br"])
    doc = f'<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>{htmllib.escape(title)}</title><style>{MD_CSS}</style></head><body>{body}</body></html>'
    with open(dst, "w", encoding="utf-8") as f: f.write(doc)

def main():
    entries, skipped, comp_log = [], [], []
    for dirname, cid, cname in COLLS:
        base = os.path.join(ROOT, dirname)
        for dirpath, dirnames, filenames in os.walk(base):
            rel_dir = os.path.relpath(dirpath, base)
            dirnames[:] = [d for d in dirnames if not SKIP_DIR_PAT.search(d)]
            for fn in sorted(filenames):
                if SKIP_FILE_PAT.search(fn) or fn == ".DS_Store": continue
                ext = os.path.splitext(fn)[1].lower()
                if ext not in (".pdf", ".md"): continue
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
                fmt = "pdf" if ext == ".pdf" else "html"
                tgt_name = fn if ext == ".pdf" else stem + ".html"
                tgt = os.path.join(tgt_dir, tgt_name)
                mode = "raw"; so = sd = size
                if os.path.exists(tgt) and os.path.getmtime(tgt) >= os.path.getmtime(src):
                    mode = "cached"  # 上次已生成,跳过拷贝/压缩
                elif ext == ".pdf":
                    if size > COMPRESS_THRESHOLD:
                        mode, so, sd = compress_pdf(src, tgt)
                        comp_log.append((fn, sd, so, mode))
                    else:
                        shutil.copy2(src, tgt)
                else:
                    md_to_html(src, tgt, title)
                web_path = "library/" + cid + cname + ("/" + sub.replace(os.sep, "/") if sub != "." else "") + "/" + tgt_name
                e = {
                    "id": md5(dirname + "/" + (rel_dir if rel_dir != "." else "") + "/" + fn),
                    "title": title or stem, "date": date,
                    "year": date[:4] if date else "",
                    "side": guess_side(cid, rel, fn),
                    "coll": cid, "collName": cname,
                    "cat": " / ".join(clean_seg(s) for s in rel.split("/")[1:] if clean_seg(s)) if "/" in rel else "",
                    "type": guess_type(cid, rel, fn),
                    "inst": guess_inst(fn),
                    "tags": build_tags(cid, cname, rel if "/" in rel else "/" + fn, fn),
                    "file": web_path.replace(os.sep, "/"),
                    "fmt": fmt, "sizeKB": round(os.path.getsize(tgt) / 1024),
                    "src": (dirname + ("/" + rel_dir if rel_dir != "." else "") + "/" + fn).replace(os.sep, "/"),
                }
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
        "skipped": skipped,
    }, ensure_ascii=False, indent=1))
    if comp_log:
        print("--- gs 压缩明细(前20) ---")
        for fn, sd, so, m in comp_log[:20]:
            print(f"  {m}  {sd//1024}KB -> {so//1024}KB  {fn[:60]}")

if __name__ == "__main__":
    main()
