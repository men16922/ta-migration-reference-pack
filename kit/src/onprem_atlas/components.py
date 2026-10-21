"""ESM WEB/WAS/DB deployment records; host inventory remains independent."""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict

from .ingest import Asset, Issue, ParsedSheet, detect_header, read_sheet
from .ingest.mapping import FIELDS, HeaderMatch, MappingProfile
from .ingest.validate import normalize_rows

SOURCES = frozenset({'web', 'was', 'db'})
EXTRA_FIELDS = ('product', 'product_version', 'version_detail', 'port', 'url', 'sid', 'ha_mode', 'rto', 'monitoring', 'agent_status')
COMPONENT_FIELDS = (*FIELDS, *EXTRA_FIELDS)
IDENTITY_FIELDS = ('organization', 'site', 'hostname', 'product', 'port', 'url', 'sid', 'business_l1', 'business_l2', 'business_l3', 'system_name')


def parse_components(path, profile: MappingProfile, kind: str) -> ParsedSheet:
    data = read_sheet(path, profile.sheet)
    header = detect_header(data.rows, profile)
    assets, issues = [], []
    seen = set()
    for offset, row in enumerate(data.rows[header.header_row:], header.header_row + 1):
        if not any(row):
            continue
        one, warnings = normalize_rows([header.headers, row], HeaderMatch(1, header.headers, header.mapping, header.unmapped, header.missing_overrides), profile)
        issues.extend(Issue(offset, i.severity, i.code, i.message) for i in warnings)
        if not one:
            continue
        values = one[0].values
        for f in EXTRA_FIELDS:
            index = header.mapping.get(f)
            values[f] = row[index].strip() or None if index is not None and index < len(row) else None
        if not values['product']:
            issues.append(Issue(offset, 'error', 'MISSING_PRODUCT', 'WEB/WAS/DB 제품명이 필요합니다.'))
        if not any(values[f] for f in ('port', 'url', 'sid')):
            issues.append(Issue(offset, 'error', 'MISSING_ENDPOINT', '인스턴스를 구분할 PORT, URL 또는 DB명(SID)이 필요합니다.'))
        if values['port']:
            if not str(values['port']).isdigit() or not 1 <= int(str(values['port'])) <= 65535:
                issues.append(Issue(offset, 'error', 'INVALID_PORT', 'PORT는 1~65535의 정수여야 합니다.'))
            else:
                values['port'] = str(int(str(values['port'])))
        identity = [kind, *[str(values.get(f) or '').lower() if f in ('organization', 'site', 'hostname') else values.get(f) for f in IDENTITY_FIELDS]]
        key = 'component-' + hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()[:24]
        if key in seen:
            issues.append(Issue(offset, 'error', 'DUPLICATE_COMPONENT', '동일한 호스트·제품·엔드포인트·업무 조합이 중복됩니다.'))
        seen.add(key)
        values['component_kind'] = kind
        assets.append(Asset(key, offset, values))
    if 'hostname' not in header.mapping:
        issues.append(Issue(header.header_row, 'error', 'MISSING_HOST_COLUMN', '호스트 컬럼이 필요합니다.'))
    return ParsedSheet(data.name, header, data.rows, assets, issues)


def associate(components: list[dict], assets: list[dict]) -> list[dict]:
    """Exact scoped host match only. No IP/VIP guesses; multiple candidates stay unresolved."""
    by_host = defaultdict(list)
    for asset in assets:
        by_host[(asset.get('hostname') or '').lower()].append(asset)
    out = []
    for item in components:
        candidates = by_host[item['hostname'].lower()]
        for field in ('organization', 'site'):
            if item.get(field):
                candidates = [a for a in candidates if (a.get(field) or '').lower() == item[field].lower()]
        match = candidates[0] if len(candidates) == 1 else None
        out.append({**item, 'asset_key': match['key'] if match else None,
                    'match_status': 'matched' if match else 'ambiguous' if candidates else 'unmatched'})
    return out
