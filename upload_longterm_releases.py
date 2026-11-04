#!/usr/bin/env python3
import csv
import json
import subprocess
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path('/Users/angel/Desktop/中欧长程资料')
REPO = Path(__file__).resolve().parent
GITHUB_REPO = 'Angel-pig-1/eu-china-policy-db'
TITLES = {
    'CNKI': '知网中欧与欧洲研究文献',
    'LAW': '欧洲法律政策原文',
    'TT': '国际智库中欧研究',
    'EUUS': '欧美关系文献',
}


def gh(args):
    return subprocess.run(['gh'] + args, check=True, text=True, stdout=subprocess.PIPE).stdout


def assets(tag):
    try:
        data = json.loads(gh(['release', 'view', tag, '--repo', GITHUB_REPO, '--json', 'assets']))
        return {item['name'] for item in data['assets']}
    except subprocess.CalledProcessError:
        return None


def main():
    import tempfile

    with (ROOT / '入库清单.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    groups = defaultdict(list)
    for row in rows:
        groups[row['资料线']].append(row)
    for prefix, items in sorted(groups.items()):
        tag = 'longterm-' + {'CNKI': 'cnki', 'LAW': 'law', 'TT': 'thinktank', 'EUUS': 'euus'}[prefix]
        remote = assets(tag)
        if remote is None:
            gh(['release', 'create', tag, '--repo', GITHUB_REPO, '--title', TITLES[prefix], '--notes', '公开来源资料附件；来源及本地校验信息见中欧长程资料清单。'])
            remote = set()
        pending = []
        for row in items:
            name = unquote(Path(urlparse(row['附件']).path).name)
            if name not in remote:
                source_dir = {'CNKI': '知网文献', 'LAW': '欧洲法律政策', 'TT': '国际智库研究', 'EUUS': '欧美关系'}[row['资料线']]
                pending.append((ROOT / source_dir / row['本地文件'], name))
        print(prefix, '远端', len(remote), '待上传', len(pending), flush=True)
        for start in range(0, len(pending), 4):
            batch = pending[start:start + 4]
            with tempfile.TemporaryDirectory(prefix='longterm-upload-') as temp_dir:
                staged = []
                for source, name in batch:
                    target = Path(temp_dir) / name
                    target.symlink_to(source)
                    staged.append(target)
                for attempt in range(4):
                    try:
                        subprocess.run(['gh', 'release', 'upload', tag, '--repo', GITHUB_REPO] + [str(p) for p in staged], check=True)
                        break
                    except subprocess.CalledProcessError:
                        if attempt == 3:
                            raise
                        time.sleep(3 * (attempt + 1))
            print(tag, min(start + 4, len(pending)), '/', len(pending), flush=True)
        expected = {unquote(Path(urlparse(row['附件']).path).name) for row in items}
        for _ in range(6):
            remote = assets(tag) or set()
            missing = expected - remote
            if not missing:
                break
            time.sleep(5)
        if missing:
            raise RuntimeError(tag + ' 缺少附件：' + '、'.join(sorted(missing)))
        print(tag, '校验完成', len(expected), flush=True)


if __name__ == '__main__':
    main()
