#!/usr/bin/env python3
import csv
import json
import os
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

ROOT = Path('/Users/angel/Desktop/ERA欧洲法律资源库')
REPO = Path(__file__).resolve().parent
TARGET = REPO / 'library' / '04欧洲法律资源'
OUT = REPO / 'era_data.js'
RELEASE = os.environ.get('ERA_RELEASE') == '1'


def release_url(row):
    tag = 'era-' + row['category'].split('_')[0]
    name = re.sub(r"['‘’\"“„”]", '.', Path(row['file']).name)
    name = name.replace('ł', 'l').replace('Ł', 'L').replace('ț', '.').replace('Ț', '.')
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    name = re.sub(r'[^A-Za-z0-9._+-]+', '.', name)
    name = re.sub(r'\.+', '.', name)
    return f'https://github.com/Angel-pig-1/eu-china-policy-db/releases/download/{tag}/{quote(name)}'
GENERIC_TITLE = re.compile(r'^(?:background documentation|documentation|trainers? manual|programme|speakers[’\' ]contributions|blended e-learning course|stand-alone e-learning course|e-learning course|view|start|index|story|paper|slides?|cases?|case stud(?:y|ies)|[\d_ -]+|[a-z]{1,3})[. ]*(?:en|en_?online)?$', re.I)
COURSE_NAMES = {
    '1049': '欧盟反洗钱法入门', '1050': '欧盟公司法入门', '924': '欧盟刑法入门',
    '1063': '欧盟跨境民事诉讼入门', '939': '欧盟数据保护法入门', '1271': '欧盟残障法入门',
    '951': '欧盟机构法入门', '940': '欧盟知识产权法入门', '1141': '欧盟公共采购法入门',
    '1161': '欧盟社会保障法入门', '1093': '欧盟增值税法入门',
}
LANGUAGES = {
    'EN': '英文版', 'DE': '德文版', 'FR': '法文版', 'ES': '西班牙文版', 'IT': '意大利文版',
    'PL': '波兰文版', 'RO': '罗马尼亚文版', 'EL': '希腊文版', 'HR': '克罗地亚文版',
    'PT': '葡萄牙文版', 'LT': '立陶宛文版', 'BG': '保加利亚文版', 'EE': '爱沙尼亚文版',
    'HU': '匈牙利文版', 'NL': '荷兰文版', 'SK': '斯洛伐克文版', 'CZ': '捷克文版',
    'CS': '捷克文版', 'LV': '拉脱维亚文版', 'SI': '斯洛文尼亚文版', 'SL': '斯洛文尼亚文版',
    'ET': '爱沙尼亚文版', 'FI': '芬兰文版', 'SV': '瑞典文版', 'MT': '马耳他文版', 'GA': '爱尔兰文版',
}


def language_of(title, url):
    raw = title.strip().lstrip('-').strip()
    if raw.upper() in LANGUAGES:
        return LANGUAGES[raw.upper()]
    if raw in ['English', '英文']:
        return '英文版'
    if raw in ['Deutsch', 'German']:
        return '德文版'
    if raw in ['Français', 'French']:
        return '法文版'
    codes = '|'.join(LANGUAGES)
    match = re.search(r'(?:^|[/_.\s-])(' + codes + r')(?:$|[_.\s-])', unquote(url), re.I)
    return LANGUAGES.get(match.group(1).upper(), '') if match else ''


def filename_title(url):
    stem = unquote(Path(urlparse(url).path).name)
    stem = re.sub(r'\.[A-Za-z0-9]+$', '', stem)
    stem = re.sub(r'^\d+[_\s-]+', '', stem)
    stem = re.sub(r'[_\s-]+(?:' + '|'.join(LANGUAGES) + r')$', '', stem, flags=re.I)
    stem = re.sub(r'[_-]+', ' ', stem)
    stem = re.sub(r'\s+', ' ', stem).strip(' .')
    if not stem or GENERIC_TITLE.match(stem) or stem.lower() in {'index', 'story', 'view', 'download', 'stand alone', 'blended'}:
        return ''
    return stem


def project_title(row):
    skip = {'wp-content', 'uploads', 'upload', 'dokumente', 'speakers_contributions', 'pdf', 'documents', 'docu', 'digitalisation_ai', 'epresentations', 'podcasts', 'kiosk', 'resources', 'library', 'e-library'}
    parts = []
    for part in urlparse(row['url']).path.split('/'):
        part = unquote(part).strip()
        if not part or part in skip or re.search(r'\.[a-z0-9]+$', part, re.I):
            continue
        if re.fullmatch(r'(?:19|20)\d{2}|0[1-9]|1[0-2]|[A-Za-z]{1,3}(?:_[A-Za-z]+)?', part):
            continue
        parts.append(part)
    if not parts:
        return row['subcategory'] if row['subcategory'] != 'ERA 资源' else re.sub(r'^\d+_', '', row['category'])
    return re.sub(r'[_-]+', ' ', parts[-1]).strip()


def display_title(row):
    raw = re.sub(r'^[-–—\s]+', '', row['title'].strip())
    course = re.search(r'/moodle/course/view\.php\?id=(\d+)', row['url'])
    if course:
        return COURSE_NAMES.get(course.group(1), re.sub(r'^\d+_', '', row['category']) + '入门') + '（在线课程）'
    language = language_of(raw, row['url'])
    filename = filename_title(row['url'])
    if GENERIC_TITLE.match(raw):
        if filename:
            title = filename
        else:
            project = project_title(row)
            title = project + ' — ' + resource_type(row)
    else:
        title = raw
    if language and language not in title:
        title += '（' + language + '）'
    return title


def legal_category(d):
    text = ' '.join([d.get('name', ''), d.get('nameZh', '')] + d.get('framings', [])).lower()
    if 'artificial intelligence' in text or '人工智能' in text:
        return '人工智能与数字治理'
    if any(x in text for x in ['battery', 'mineral', '矿产', '电池', '关键原材料']):
        return '矿产与关键原材料'
    if any(x in text for x in ['human rights', 'due diligence', '人权', '尽职调查']):
        return '人权与供应链'
    if any(x in text for x in ['digital', 'data', '数字', '数据']):
        return '数据与数字治理'
    return '贸易与经济安全'


def legal_entry(d):
    source = Path(REPO / 'originals' / d['file'])
    text = ' '.join([d.get('name', ''), d.get('nameZh', '')])
    kind = '政策文件' if any(x in text for x in ['strategi', '战略', 'Strategy']) else '法律法规'
    inst = '欧洲议会 / 欧盟理事会'
    if '_IT_' in d['file']:
        inst = '意大利议会 / 官方公报'
    elif '_SE_' in d['file']:
        inst = '瑞典政府'
    elif '_DE_' in d['file']:
        inst = '德国联邦政府'
    return {
        'id': d['id'], 'title': d.get('nameZh') or d['name'], 'date': d['date'], 'year': d['date'][:4],
        'side': 'EU', 'coll': '04', 'collName': '欧洲法律', 'cat': legal_category(d),
        'type': kind, 'inst': inst, 'tags': d.get('framings', []),
        'file': 'originals/' + d['file'], 'fmt': 'pdf',
        'sizeKB': round(source.stat().st_size / 1024), 'src': d['url'],
        'external': False, 'hosted': False,
    }


def year_of(row):
    match = re.search(r'/(19|20)\d{2}/(?:0[1-9]|1[0-2])/', row['url'])
    if match:
        return match.group(0).strip('/').split('/')[0]
    match = re.search(r'\b(?:19|20)\d{2}\b', row['title'])
    return match.group(0) if match else ''


def resource_type(row):
    kind = row['type']
    title = row['title'].lower()
    if kind == 'pdf':
        if 'trainer' in title or 'manual' in title:
            return '培训手册'
        if 'background' in title or 'documentation' in title:
            return '背景文件'
        return '培训资料'
    return {
        'doc': '教学模板', 'docx': '教学模板', 'ppt': '教学课件', 'pptx': '教学课件',
        'xls': '数据表', 'xlsx': '数据表', 'zip': '资源包', 'mp4': '视频',
        'mp3': '播客', 'interactive': '互动课件', 'moodle': '在线课程',
    }.get(kind, '培训资料')


def main():
    with (ROOT / 'manifest.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.DictReader(f) if r['status'] != 'failed' and r['type'] != 'mp4']
    entries = []
    copied = 0
    for row in rows:
        kind = row['type']
        downloaded = row['status'] == 'downloaded'
        hosted = downloaded and RELEASE
        external = not downloaded or hosted
        file_value = row['url']
        if downloaded and RELEASE:
            file_value = release_url(row)
        elif downloaded:
            source = ROOT / row['file']
            target = TARGET / row['category'] / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.stat().st_size != source.stat().st_size:
                if target.exists():
                    target.unlink()
                os.symlink(source, target)
                copied += 1
            file_value = str(target.relative_to(REPO))
        year = year_of(row)
        category = re.sub(r'^\d+_', '', row['category'])
        entries.append({
            'id': row['id'], 'title': display_title(row), 'date': year, 'year': year,
            'side': 'EU', 'coll': '05', 'collName': 'ERA 法律培训', 'cat': category,
            'type': resource_type(row), 'inst': '欧洲法律学院（ERA）',
            'tags': [category, row['subcategory']], 'file': file_value,
            'fmt': kind if downloaded else 'online',
            'sizeKB': round(int(row['size']) / 1024) if row['size'] else 0,
            'src': row['url'], 'external': external, 'hosted': hosted,
        })
    seen = {}
    for entry in entries:
        key = entry['title'].lower()
        if key in seen:
            extra = language_of('', entry['src'])
            if not extra and entry['tags']:
                extra = entry['tags'][-1]
            candidate = entry['title'] + ' · ' + extra if extra else entry['title']
            if candidate.lower() in seen:
                candidate = entry['title'] + ' · ' + entry['id']
            entry['title'] = candidate
            key = candidate.lower()
        seen[key] = True

    legal_text = (REPO / 'legal_data.js').read_text(encoding='utf-8')
    legal_items = json.loads(legal_text[legal_text.index('['):].rstrip().rstrip(';'))
    entries.extend(legal_entry(d) for d in legal_items)

    OUT.write_text('const ERA=' + json.dumps(entries, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'欧洲法律条目 {len(entries)}（含法律政策 {len(legal_items)}），本次链接文件 {copied}，输出 {OUT.name}')


if __name__ == '__main__':
    main()
