#!/usr/bin/env python3
import csv
import hashlib
import shutil
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path('/Users/angel/Desktop/中欧长程资料')
SOURCE = ROOT / '讲话扩展'
TARGET = ROOT / '领导讲话与最新政策'
MANIFEST = TARGET / 'manifest.csv'
SKIP = {'S003', 'S005', 'S007', 'S014', 'H002'}
HTML_IDS = {'H001', 'H003'}


def category(row):
    text = row['主题'] + row['场合']
    if '中国' in text or '欧中' in text or '德中' in text:
        return '对华政策'
    if any(x in text for x in ['安全', '防务', '乌克兰', '主权', '地缘政治']):
        return '安全防务'
    if any(x in text for x in ['经济', '贸易', '竞争力', '能源', '原材料']):
        return '经贸科技'
    return '领导讲话'


def institution(value):
    return {'德国': '德国/联邦政府', '欧盟委员会': '欧盟/欧盟委员会'}.get(value, value)


def download_html(row, target):
    req = urllib.request.Request(row['实际原文地址'], headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    text = data.decode('utf-8', 'replace')
    if len(data) < 5000 or row['人物'].split()[-1].lower() not in text.lower():
        raise RuntimeError('HTML 原文核验失败：' + row['编号'])
    target.write_bytes(data)
    return data


def main():
    with MANIFEST.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        existing = list(reader)
    ids = {row['编号'] for row in existing}
    with (SOURCE / 'manifest.csv').open(encoding='utf-8-sig', newline='') as f:
        source_rows = list(csv.DictReader(f))
    merged = []
    skipped = []
    for row in source_rows:
        source_id = row['编号']
        if source_id in SKIP:
            skipped.append({'编号': source_id, '原因': '现有库已有同一讲话'})
            continue
        new_id = 'SPEECH-' + source_id
        if new_id in ids:
            skipped.append({'编号': source_id, '原因': '已合并'})
            continue
        cat = category(row)
        inst = institution(row['国家/机构'])
        source_file = SOURCE / row['本地文件']
        target_dir = TARGET / inst / cat
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file = target_dir / source_file.name
        if row['格式'].upper() == 'PDF':
            data = source_file.read_bytes()
            if not data.startswith(b'%PDF-') or len(data) != int(row['文件字节数']):
                raise RuntimeError('PDF 大小或文件头不一致：' + source_id)
            if hashlib.sha256(data).hexdigest() != row['SHA256']:
                raise RuntimeError('PDF SHA256 不一致：' + source_id)
            pages = len(PdfReader(str(source_file), strict=False).pages)
            if pages < 1:
                raise RuntimeError('PDF 页数为零：' + source_id)
            shutil.copyfile(source_file, target_file)
            fmt = 'pdf'
            note = row['校验说明']
        elif source_id in HTML_IDS:
            target_file = target_dir / (source_id + '_' + row['日期'] + '.html')
            data = download_html(row, target_file)
            fmt = 'html'
            note = '官方HTML全文已保存并核验人物；未转制PDF'
        else:
            continue
        merged.append({
            '编号': new_id,
            '中文题名': row['中文题名'],
            '原文标题': row['原文标题'],
            '人物': row['人物'],
            '职务': row['职务'],
            '国家/机构': inst,
            '主题': cat,
            '场合': row['场合'],
            '日期': row['日期'],
            '官方落地页': row['官方落地页'],
            '实际原文地址': row['实际原文地址'],
            '本地文件': str(target_file.relative_to(TARGET)),
            '格式': fmt,
            '状态': '成功',
            '校验说明': note,
            '文件字节数': str(len(data)),
            'SHA256': hashlib.sha256(data).hexdigest(),
            '下载时间': row['下载时间'],
        })
        ids.add(new_id)
    with MANIFEST.open('a', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        for row in merged:
            writer.writerow(row)
    with (SOURCE / 'merge_report.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['编号', '原因'])
        writer.writeheader()
        writer.writerows(skipped)
    print('新增', len(merged), '去重', len(skipped), '讲话总计', sum(r['状态'] == '成功' and r['人物'] not in {'', '—'} for r in existing + merged))


if __name__ == '__main__':
    main()
