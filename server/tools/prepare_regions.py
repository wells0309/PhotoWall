"""Create the bundled China region search index from the official GeoNames CN.zip."""
import argparse
import io
import json
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
with zipfile.ZipFile(args.source) as bundle:
    with bundle.open('CN.txt') as source:
        rows = [row for line in io.TextIOWrapper(source, encoding='utf-8')
                if len(row := line.rstrip('\n').split('\t')) >= 19
                and row[6] == 'A' and row[7] in ('ADM1', 'ADM2', 'ADM3')]


def name(row):
    choices = [value for value in row[3].split(',') if re.fullmatch(r'[\u3400-\u9fff·]+', value)]
    suffixes = {'ADM1': ('省', '自治区', '市'), 'ADM2': ('市', '自治州', '地区', '盟'), 'ADM3': ('区', '县', '市', '旗', '林区', '特区')}[row[7]]
    matching = [value for value in choices if value.endswith(suffixes)]
    return (matching or choices or [row[1]])[0]


provinces = {row[10]: name(row) for row in rows if row[7] == 'ADM1'}
cities = {(row[10], row[11]): name(row) for row in rows if row[7] == 'ADM2'}
output = []
missing = []
for row in rows:
    level = {'ADM1': 'province', 'ADM2': 'city', 'ADM3': 'district'}[row[7]]
    province = provinces.get(row[10], '')
    city = cities.get((row[10], row[11]), '') if row[7] == 'ADM3' else ''
    leaf = name(row)
    if not re.search(r'[\u3400-\u9fff]', leaf):
        missing.append(row[0])
    parts = []
    for value in [province, city, leaf]:
        if value and value not in parts:
            parts.append(value)
    aliases = ','.join([row[1], row[2]] + [x for x in row[3].split(',') if re.fullmatch(r'[\u3400-\u9fff·]+', x)])
    output.append('\t'.join([row[0], 'CN', level, ' / '.join(parts), leaf, row[4], row[5], aliases]))
target = Path(__file__).resolve().parents[1] / 'src/main/resources/geodata/china-regions.tsv'
target.write_text('\n'.join(sorted(output)) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'regions': len(output), 'districts': sum(row[7] == 'ADM3' for row in rows), 'withoutChineseName': missing, 'bytes': target.stat().st_size}))
