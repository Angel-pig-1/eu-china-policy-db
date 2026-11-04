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
    name = re.sub(r"['‘’\"“”]", '.', Path(row['file']).name)
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    name = re.sub(r'[^A-Za-z0-9._-]+', '.', name)
    name = re.sub(r'\.+', '.', name)
    return f'https://github.com/Angel-pig-1/eu-china-policy-db/releases/download/{tag}/{quote(name)}'
GENERIC_TITLE = re.compile(r'^(?:background documentation|documentation|trainers? manual|programme|speakers[’\' ]contributions|[\d_ ]+)(?:\s+(?:en|en_?online))?$', re.I)


def display_title(row):
    title = row['title']
    if not GENERIC_TITLE.match(title):
        return title
    skip = {'wp-content', 'uploads', 'upload', 'dokumente', 'speakers_contributions', 'pdf', 'documents', 'docu', 'digitalisation_ai', 'epresentations', 'podcasts'}
    parts = []
    for part in urlparse(row['url']).path.split('/'):
        part = unquote(part).strip()
        if not part or part in skip or re.search(r'\.[a-z0-9]+$', part, re.I):
            continue
        if re.fullmatch(r'(?:19|20)\d{2}|0[1-9]|1[0-2]|[A-Za-z]{1,3}(?:_[A-Za-z]+)?', part):
            continue
        parts.append(part)
    if not parts:
        return title
    project = re.sub(r'[_-]+', ' ', parts[-1]).strip()
    return project + ' — ' + title


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
            'side': 'EU', 'coll': '04', 'collName': '欧洲法律', 'cat': category,
            'type': resource_type(row), 'inst': '欧洲法律学院（ERA）',
            'tags': [category, row['subcategory']], 'file': file_value,
            'fmt': kind if downloaded else 'online',
            'sizeKB': round(int(row['size']) / 1024) if row['size'] else 0,
            'src': row['url'], 'external': external, 'hosted': hosted,
        })
    OUT.write_text('const ERA=' + json.dumps(entries, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'ERA 条目 {len(entries)}，本次复制文件 {copied}，输出 {OUT.name}')


if __name__ == '__main__':
    main()
