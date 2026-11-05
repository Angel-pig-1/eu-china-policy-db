#!/usr/bin/env python3
import csv
import json
import shutil
from pathlib import Path

from pypdf import PdfReader

ROOT = Path('/Users/angel/Desktop/中欧长程资料/领导讲话与最新政策')
REPO = Path(__file__).resolve().parent
ORIGINALS = REPO / 'originals'
OUT = REPO / 'leadership_data.js'


def main():
    speeches = []
    policies = []
    with (ROOT / 'manifest.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = [row for row in csv.DictReader(f) if row['状态'] == '成功']
    for row in rows:
        source = ROOT / row['本地文件']
        if not source.is_file() or source.stat().st_size == 0:
            raise RuntimeError('文件缺失：' + str(source))
        fmt = row['格式'].lower()
        if fmt == 'pdf':
            with source.open('rb') as f:
                if f.read(5) != b'%PDF-':
                    raise RuntimeError('PDF 文件头错误：' + str(source))
            if len(PdfReader(str(source), strict=False).pages) < 1:
                raise RuntimeError('PDF 页数为零：' + str(source))
        elif fmt != 'html':
            raise RuntimeError('暂不支持的格式：' + fmt)
        target = ORIGINALS / ('LEAD_' + row['编号'] + source.suffix.lower())
        shutil.copyfile(source, target)
        relative = 'originals/' + target.name
        person = row['人物'].strip()
        is_speech = bool(person and person != '—')
        entry = {
            'id': row['编号'],
            'title': row['中文题名'],
            'originalTitle': row['原文标题'],
            'date': row['日期'],
            'year': row['日期'][:4],
            'side': 'EU',
            'coll': '07',
            'collName': '领导讲话与最新政策',
            'cat': row['主题'],
            'type': '领导讲话' if is_speech else '政策文件',
            'inst': row['国家/机构'],
            'authors': person if is_speech else '',
            'tags': list(dict.fromkeys([row['主题'], row['场合'], row['人物'], row['职务']])),
            'file': relative,
            'fmt': fmt,
            'sizeKB': round(target.stat().st_size / 1024),
            'src': row['官方落地页'],
            'external': False,
            'hosted': False,
        }
        if is_speech:
            speeches.append(entry)
        else:
            policies.append({
                **entry,
                'name': row['原文标题'],
                'cnLabel': row['中文题名'],
                'nameZh': row['中文题名'],
                'status': '官方原文已收录',
                'statusZh': '官方原文已收录',
                'background': row['场合'] + '；' + row['国家/机构'],
                'backgroundZh': row['场合'] + '；' + row['国家/机构'],
                'implication': '主题：' + row['主题'],
                'implicationZh': '主题：' + row['主题'],
                'impacted': 0,
                'framings': [row['主题']],
                'industries': [],
                'url': row['官方落地页'],
                'file': target.name,
                'source': 'official',
            })
    speeches.sort(key=lambda x: x['date'], reverse=True)
    policies.sort(key=lambda x: x['date'], reverse=True)
    OUT.write_text('const LEAD=' + json.dumps(speeches, ensure_ascii=False) + ';\nconst LEAD_POLICY=' + json.dumps(policies, ensure_ascii=False) + ';\n', encoding='utf-8')
    print('领导讲话', len(speeches), '最新政策', len(policies), '合计', len(rows))


if __name__ == '__main__':
    main()
