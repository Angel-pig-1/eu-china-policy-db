#!/usr/bin/env python3
import csv
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path
from urllib.parse import quote

from pypdf import PdfReader

ROOT = Path('/Users/angel/Desktop/中欧长程资料')
REPO = Path(__file__).resolve().parent
OUT = REPO / 'longterm_data.js'
TODAY = '2026-11-05'

SOURCES = [
    ('CNKI', ROOT / '知网文献', '01', '中欧关系', 'CN', 'longterm-cnki'),
    ('LAW', ROOT / '欧洲法律政策', '04', '欧洲法律', 'EU', 'longterm-law'),
    ('TT', ROOT / '国际智库研究', '01', '中欧关系', 'INTL', 'longterm-thinktank'),
    ('EUUS', ROOT / '欧美关系', '06', '欧美关系', 'INTL', 'longterm-euus'),
]


def first(row, *names):
    for name in names:
        value = row.get(name)
        if value and value.strip():
            return value.strip()
    return ''


def clean_title(value):
    value = unicodedata.normalize('NFKC', value or '')
    value = re.sub(r'\.(?:pdf|caj|docx?|html?)$', '', value, flags=re.I)
    value = value.replace('_', ' ')
    value = value.replace('迈向 renewed 跨大西洋伙伴关系', '迈向更新的跨大西洋伙伴关系')
    value = re.sub(r'\s+', ' ', value)
    if re.search(r'[\u4e00-\u9fff]', value):
        value = value.replace(':', '：').replace('?', '？').replace(',', '，')
    value = re.sub(r'\s+([，。；：、）】])', r'\1', value)
    value = re.sub(r'([（【])\s+', r'\1', value)
    return value.strip(' ._-')


def asset_name(name):
    name = re.sub(r"['‘’\"“„”]", '.', name)
    name = name.replace('ł', 'l').replace('Ł', 'L').replace('ț', '.').replace('Ț', '.')
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    name = re.sub(r'[^A-Za-z0-9._+-]+', '.', name)
    return re.sub(r'\.+', '.', name).strip('.')


def successful(status):
    status = (status or '').lower()
    if any(x in status for x in ['失败', '无法', 'failed', 'error', '不存在', '待下载']):
        return False
    return any(x in status for x in ['已下载', 'downloaded', 'verified', 'success', 'ok'])


def valid_date(value):
    value = (value or '').strip()
    match = re.search(r'\b((?:18|19|20)\d{2})(?:[-./年](\d{1,2}))?(?:[-./月](\d{1,2}))?', value)
    if not match:
        return '', ''
    year, month, day = match.groups()
    if int(year) > 2026:
        return '', ''
    date = year
    if month:
        date += '-' + month.zfill(2)
    if day:
        date += '-' + day.zfill(2)
    if date > TODAY:
        date = year
    return date, year


def thinktank_collection(category, title):
    text = category + ' ' + title
    if re.search(r'经贸|贸易|经济|产业|供应链|矿产|投资|金融|关税|商业', text):
        return '02', '贸易协定'
    return '01', '中欧关系'


def validate_file(path):
    if not path.is_file() or path.stat().st_size < 100:
        raise ValueError('文件不存在或内容为空')
    suffix = path.suffix.lower()
    if suffix not in {'.pdf', '.caj'}:
        raise ValueError('仅收录 PDF 或 CAJ，当前格式：' + suffix)
    with path.open('rb') as f:
        header = f.read(16)
    if suffix == '.pdf':
        if not header.startswith(b'%PDF-'):
            raise ValueError('文件头不是 PDF')
        try:
            result = subprocess.run(['pdfinfo', str(path)], check=True, capture_output=True, text=True, timeout=20)
            match = re.search(r'^Pages:\s+(\d+)\s*$', result.stdout, re.M)
            pages = int(match.group(1)) if match else 0
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
            pages = len(PdfReader(str(path), strict=False).pages)
        if pages < 1:
            raise ValueError('PDF 页数为零')
        return 'pdf', pages
    if not (header.startswith(b'%CAJ') or header.startswith(b'CAJ') or header.startswith(b'{\\rtf')):
        raise ValueError('CAJ 文件头未通过校验')
    return 'caj', 0


def entry_for(prefix, root, coll, coll_name, side, tag, row):
    status = first(row, '状态', '下载状态', 'status', 'Status')
    relative = first(row, '本地文件', '本地文件名', '文件路径', 'file', 'path', 'local_file')
    if not successful(status):
        detail = first(row, '校验与备注', '验证说明', '核验说明', '失败原因', '原因', 'error', '备注')
        return None, detail or status or '清单未标记为下载成功'
    if not relative:
        return None, '清单缺少本地文件路径'
    path = root / relative
    try:
        fmt, pages = validate_file(path)
    except Exception as exc:
        return None, str(exc)

    title = clean_title(first(row, '中文题名', '中文标题', 'title_zh', 'nameZh', '标题', 'title', 'name'))
    original = clean_title(first(row, '英文题名', '英文标题', '原始标题', 'original_title'))
    if not original:
        candidate = clean_title(first(row, '标题', 'title', 'name'))
        if candidate != title:
            original = candidate
    if not title or re.fullmatch(r'[\d ._-]+', title):
        return None, '标题为空或无意义'
    if relative == '政治外交/The_United_States_and_Europe_A_Concrete_Agenda_for_Transatlantic_Cooperation.pdf':
        title = '美国与欧洲：跨大西洋合作应对中国挑战的具体议程'
    date, year = valid_date(first(row, '日期', '年份', 'year', 'date', '发表日期', '出版日期'))
    category = first(row, '主题', '分类', '类目', 'category', 'topic', 'cat') or path.parent.name
    if prefix == 'LAW':
        category = {
            '01_AI数字数据': '人工智能、数字与数据',
            '02_人权劳动与供应链': '人权、劳动与供应链', '03_人权劳动与基本权利': '人权、劳动与供应链',
            '02_关键矿产与矿业': '关键矿产与矿业',
            '03_知识产权': '知识产权', '04_知识产权': '知识产权',
            '04_贸易投资与竞争': '贸易、投资与竞争', '05_贸易投资与竞争': '贸易、投资与竞争',
            '05_环境气候与能源': '环境、气候与能源', '06_环境气候与能源': '环境、气候与能源',
            '06_农业': '农业与食品', '07_农业': '农业与食品',
            '07_金融税收': '金融与税收', '08_金融税收': '金融与税收',
            '08_教育科研': '教育与科研', '09_教育科研': '教育与科研',
            '09_移民安全与国防': '移民、安全与国防', '10_移民安全与国防': '移民、安全与国防',
            '10_公共卫生与消费者': '公共卫生与消费者', '11_公共卫生与消费者': '公共卫生与消费者',
        }.get(category, re.sub(r'^\d+_', '', category))
    if prefix == 'TT':
        coll, coll_name = thinktank_collection(category, title + ' ' + original)
    institution = first(row, '机构/作者', '机构', '来源机构', 'institution', 'org', 'publisher')
    authors = first(row, '作者', 'authors', 'author')
    source = first(row, '来源', '期刊', 'source', 'journal')
    if not institution:
        institution = source
    kind = {'CNKI': '学术论文', 'LAW': '法律法规', 'TT': '智库报告', 'EUUS': '专题文献'}[prefix]
    if prefix == 'TT' and relative.startswith('05_开放学术论文/'):
        kind = '学术论文'
    if prefix == 'TT' and relative.startswith('06_大学与工作论文/'):
        kind = '工作论文'
    if prefix == 'LAW' and re.search(r'战略|政策|规划|strategy|policy', title + ' ' + original, re.I):
        kind = '政策文件'
    landing = first(row, '落地页', '官方落地页', '知网详情URL', '来源URL', '详情URL', 'landing', 'url', 'src')
    pdf_url = first(row, 'PDF URL', 'PDF地址', 'pdf_url', 'download_url')
    keywords = first(row, '关键词', '检索词', 'keywords', 'tags')
    digest = hashlib.sha1((prefix + ':' + relative).encode()).hexdigest()[:10].upper()
    remote_name = asset_name(path.name)
    if path.name.isascii():
        remote_name = prefix + '-' + digest + '-' + remote_name
    else:
        remote_name = prefix + '-' + digest + path.suffix.lower()
    entry = {
        'id': prefix + '-' + digest,
        'title': title,
        'date': date,
        'year': year,
        'side': side,
        'coll': coll,
        'collName': coll_name,
        'cat': category,
        'type': kind,
        'inst': institution,
        'authors': authors,
        'tags': list(dict.fromkeys([x for x in [category, keywords] if x])),
        'originalTitle': original,
        'file': 'https://github.com/Angel-pig-1/eu-china-policy-db/releases/download/' + tag + '/' + quote(remote_name),
        'fmt': fmt,
        'sizeKB': round(path.stat().st_size / 1024),
        'pages': pages,
        'src': landing or pdf_url,
        'external': True,
        'hosted': True,
    }
    return entry, ''


def main():
    entries = []
    unavailable = []
    inventory = []
    for prefix, root, coll, coll_name, side, tag in SOURCES:
        manifest = root / 'manifest.csv'
        if not manifest.exists():
            unavailable.append({'资料线': prefix, '标题': '', '来源': '', '原因': '尚未生成 manifest.csv'})
            continue
        with manifest.open(encoding='utf-8-sig', newline='') as f:
            rows = list(csv.DictReader(f))
        for row in rows:
            entry, reason = entry_for(prefix, root, coll, coll_name, side, tag, row)
            title = clean_title(first(row, '中文题名', '中文标题', '标题', 'title', 'name'))
            source = first(row, '落地页', '知网详情URL', '来源URL', 'PDF URL', 'url', 'src')
            if not entry:
                unavailable.append({'资料线': prefix, '标题': title, '来源': source, '原因': reason})
                continue
            entries.append(entry)
            inventory.append({
                'ID': entry['id'], '资料线': prefix, '标题': entry['title'], '机构': entry['inst'],
                '日期': entry['date'], '分类': entry['cat'], '格式': entry['fmt'], '页数': entry['pages'],
                '本地文件': first(row, '本地文件', '本地文件名', '文件路径', 'file', 'path', 'local_file'),
                '来源': entry['src'], '附件': entry['file'],
            })
    ids = set()
    unique = []
    for entry in entries:
        if entry['id'] in ids:
            raise RuntimeError('ID 冲突：' + entry['id'])
        ids.add(entry['id'])
        unique.append(entry)
    entries = sorted(unique, key=lambda x: (x['coll'], x['cat'], x['title'].lower(), x['id']))
    payload = json.dumps(entries, ensure_ascii=False)
    OUT.write_text('const LONGTERM=' + payload + ';\n', encoding='utf-8')
    version = hashlib.sha256(payload.encode()).hexdigest()[:10]
    for html_name in ['index.html', 'library.html', 'stats.html']:
        html_path = REPO / html_name
        html = html_path.read_text(encoding='utf-8')
        updated = re.sub(r'longterm_data\.js\?v=[^"\']+', 'longterm_data.js?v=' + version, html)
        if updated != html:
            html_path.write_text(updated, encoding='utf-8')
    for filename, rows in [('入库清单.csv', inventory), ('未入库清单.csv', unavailable)]:
        path = ROOT / filename
        fields = list(rows[0]) if rows else (['ID', '资料线', '标题'] if filename == '入库清单.csv' else ['资料线', '标题', '来源', '原因'])
        with path.open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    counts = {prefix: sum(e['id'].startswith(prefix + '-') for e in entries) for prefix, *_ in SOURCES}
    print('入库', len(entries), counts, '未入库', len(unavailable))


if __name__ == '__main__':
    main()
