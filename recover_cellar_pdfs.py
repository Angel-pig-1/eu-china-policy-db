#!/usr/bin/env python3
import csv
import hashlib
import http.client
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path('/Users/angel/Desktop/中欧长程资料/欧洲法律政策')
MANIFEST = ROOT / 'manifest.csv'
REPORT = ROOT / 'cellar_recovery.csv'
FOLDERS = {
    'AI/数字/数据': '01_AI数字数据',
    '人权/劳动/基本权利': '02_人权劳动与供应链',
    '知识产权': '03_知识产权',
    '贸易/投资/竞争': '04_贸易投资与竞争',
    '环境/气候/能源': '05_环境气候与能源',
    '农业': '06_农业',
    '金融/税收': '07_金融税收',
    '教育/科研': '08_教育科研',
    '移民/安全/国防': '09_移民安全与国防',
    '公共卫生/消费者': '10_公共卫生与消费者',
    '社会文化': '11_社会文化',
}


def request(url, accept):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': accept})
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError, http.client.IncompleteRead, ConnectionError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def celex_of(row):
    text = row['官方落地页'] + ' ' + row['PDF URL']
    match = re.search(r'CELEX(?::|%3A|=)([0-9A-Z()]+)', text, re.I)
    if not match:
        match = re.search(r'/celex/([0-9A-Z()]+)', text, re.I)
    return match.group(1).upper() if match else ''


def cellar_id(celex):
    query = 'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT ?work WHERE { ?work cdm:resource_legal_id_celex "' + celex + '"^^<http://www.w3.org/2001/XMLSchema#string> . }'
    url = 'https://publications.europa.eu/webapi/rdf/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'application/sparql-results+json'})
    data = json.loads(request(url, 'application/sparql-results+json'))
    bindings = data['results']['bindings']
    if not bindings:
        return ''
    return bindings[0]['work']['value'].rsplit('/', 1)[-1]


def main():
    with MANIFEST.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    report = []
    for row in rows:
        if row['状态'] == '已下载并验证':
            continue
        celex = celex_of(row)
        if not celex:
            continue
        try:
            identifier = cellar_id(celex)
            if not identifier:
                raise RuntimeError('Cellar 无对应资源')
            url = 'https://op.europa.eu/o/opportal-service/download-handler?' + urllib.parse.urlencode({
                'identifier': identifier, 'format': 'pdfa2a', 'language': 'en', 'productionSystem': 'cellar', 'part': ''
            })
            data = request(url, 'application/pdf')
            if not data.startswith(b'%PDF-'):
                raise RuntimeError('下载内容不是 PDF')
            folder = FOLDERS.get(row['领域'], '04_贸易投资与竞争')
            relative = '欧盟/' + folder + '/' + row['日期'] + '_' + celex + '.pdf'
            target = ROOT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            reader = PdfReader(str(target), strict=False)
            pages = len(reader.pages)
            if pages < 1:
                raise RuntimeError('PDF 页数为零')
            text = '\n'.join((page.extract_text() or '') for page in reader.pages[:2])
            if len(text.strip()) < 100:
                raise RuntimeError('首页无可提取文本')
            row.update({
                'PDF URL': url,
                '本地文件': relative,
                '状态': '已下载并验证',
                '页数': str(pages),
                '文件大小（字节）': str(len(data)),
                '验证说明': '出版局 Cellar 正式 PDF；' + str(pages) + '页；首页文本可提取；SHA256 ' + hashlib.sha256(data).hexdigest(),
            })
            report.append({'CELEX': celex, '标题': row['中文题名'], '状态': '恢复成功', '页数': pages, '文件': relative})
            print('恢复', celex, pages, '页', flush=True)
            time.sleep(1)
        except Exception as exc:
            report.append({'CELEX': celex, '标题': row['中文题名'], '状态': '仍失败：' + str(exc), '页数': '', '文件': ''})
            print('失败', celex, str(exc), flush=True)
    with MANIFEST.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with REPORT.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['CELEX', '标题', '状态', '页数', '文件'])
        writer.writeheader()
        writer.writerows(report)
    print('恢复成功', sum(r['状态'] == '恢复成功' for r in report), '失败', sum(r['状态'] != '恢复成功' for r in report))


if __name__ == '__main__':
    main()
