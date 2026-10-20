"""합성 ESM 자산 엑셀 생성기 (테스트·시연용, 실제 회사 데이터 없음).

명명 규칙: `<센터2><환경1>-<업무코드>-<역할><순번2>` (예: `a1p-erp-was01`).
ESM 내보내기처럼 제목·조회조건 행, 매핑되지 않는 컬럼, 섞인 단위, 일부러 넣은 오류 행을 포함한다.
"""

from __future__ import annotations

import random
from pathlib import Path

from openpyxl import Workbook

HEADERS = [
    "자산번호",
    "호스트명",
    "IP 주소",
    "자산분류",
    "제조사",
    "모델명",
    "OS",
    "CPU 모델",
    "CPU 소켓",
    "CPU 코어",
    "메모리(GB)",
    "센터",
    "랙",
    "망구분",
    "시스템명",
    "담당자",
    "운영상태",
    "도입일",
    "비고",
]
TITLE_ROWS = [["ESM 자산 목록 (합성 데이터)"], ["조회 조건: 전체 자산 / 기준일 2026-10-21"], []]

SITES = {"a1": "제1센터", "b2": "제2센터"}
ENVS = {"p": "운영", "d": "개발", "s": "스테이징"}
ROLES = {  # 역할 → (자산분류, 망구분(운영), 비중)
    "web": ("서버", "DMZ", 2),
    "was": ("서버", "업무망", 3),
    "app": ("서버", "업무망", 2),
    "bat": ("서버", "업무망", 1),
    "db": ("DB 서버", "DB망", 2),
}
SHARED = [("ad", "AD/DNS"), ("bkp", "백업"), ("mon", "모니터링"), ("ntp", "NTP"), ("sec", "보안관제")]
NETWORK = [("fw", "보안장비(방화벽)", "SECUI", "BLUEMAX NGF-2000"), ("sw", "네트워크(L3 스위치)", "Arista", "7050X3"), ("l4", "네트워크(L4)", "F5", "BIG-IP i4800")]
SERVERS = [
    ("Dell", "PowerEdge R750", "Intel Xeon Gold 6338", 2, 32),
    ("Dell", "PowerEdge R650", "Intel Xeon Silver 4314", 2, 16),
    ("HPE", "ProLiant DL380 Gen10", "Intel Xeon Gold 6248R", 2, 24),
    ("HPE", "ProLiant DL360 Gen11", "Intel Xeon Gold 5418Y", 2, 24),
    ("Lenovo", "ThinkSystem SR650 V2", "AMD EPYC 7543", 1, 32),
    ("IBM", "Power S922", "IBM POWER9", 2, 10),
]
OSES = ["RHEL 8.8", "RHEL 9.4", "RHEL 9.4", "Rocky Linux 8.9", "Ubuntu 22.04", "Windows Server 2019", "Windows Server 2022", "AIX 7.2", "CentOS 7.9", "Windows Server 2012 R2"]
OWNERS = ["김운영", "이인프라", "박시스템", "최서버", "정DBA", "한네트워크"]
SYLLABLES = ["erp", "crm", "hr", "fin", "scm", "mes", "pay", "card", "loan", "ib", "mob", "chn", "cms", "edw", "bi", "gw", "sso", "mail", "doc", "pos"]


def project_codes(n: int) -> list[str]:
    base = list(SYLLABLES)
    out: list[str] = []
    i = 0
    while len(out) < n:
        out.append(base[i % len(base)] + ("" if i < len(base) else str(i // len(base))))
        i += 1
    return out


def generate_rows(count: int = 5000, seed: int = 20261021, projects: int = 150) -> list[list[str]]:
    """데이터 행 `count`개(헤더 제외). 같은 seed면 항상 같은 결과."""
    rng = random.Random(seed)
    codes = project_codes(projects)
    project_names = {c: f"{c.upper()} 시스템" for c in codes}
    rows: list[list[str]] = []
    seq: dict[tuple[str, str, str, str], int] = {}
    tag = 0

    def next_name(site: str, env: str, code: str, role: str) -> str:
        k = (site, env, code, role)
        seq[k] = seq.get(k, 0) + 1
        return f"{site}{env}-{code}-{role}{seq[k]:02d}"

    def server_row(hostname: str, category: str, zone: str, system: str, site: str, ip: str, status: str = "운영") -> list[str]:
        nonlocal tag
        tag += 1
        mfr, model, cpu, sockets, cores = rng.choice(SERVERS)
        mem = rng.choice([32, 64, 128, 256, 512])
        mem_text = rng.choices([str(mem), f"{mem}GB", f"{mem * 1024}MB"], weights=[8, 1, 1])[0]
        core_text = rng.choices([str(sockets * cores), f"{sockets}x{cores}"], weights=[9, 1])[0]
        return [
            f"AS-{tag:06d}",
            hostname,
            ip,
            category,
            mfr,
            model,
            rng.choice(OSES),
            cpu,
            str(sockets),
            core_text,
            mem_text,
            SITES[site],
            f"{rng.choice('ABCDEFGH')}{rng.randint(1, 20):02d}",
            zone,
            system,
            rng.choice(OWNERS),
            status,
            f"20{rng.randint(15, 24)}-{rng.randint(1, 12):02d}-01",
            "",
        ]

    # 공통 인프라 · 네트워크 장비 (프로젝트 아님)
    for site in SITES:
        for code, system in SHARED:
            for n in range(1, 3):
                rows.append(server_row(f"{site}p-{code}-svr{n:02d}", "서버", "공통인프라망", system, site, f"10.{9 if site == 'a1' else 19}.1.{len(rows) % 250 + 1}"))
        for code, category, mfr, model in NETWORK:
            for n in range(1, 5):
                tag += 1
                rows.append(
                    [
                        f"AS-{tag:06d}",
                        f"{site}p-net-{code}{n:02d}",
                        f"10.{9 if site == 'a1' else 19}.254.{len(rows) % 250 + 1}",
                        category,
                        mfr,
                        model,
                        "",
                        "",
                        "",
                        "",
                        "",
                        SITES[site],
                        f"N{n:02d}",
                        "네트워크",
                        "네트워크 인프라",
                        "한네트워크",
                        "운영",
                        "2021-01-01",
                        "",
                    ]
                )

    # 프로젝트 서버
    weights = [w for _, _, w in ROLES.values()]
    role_names = list(ROLES)
    while len(rows) < count:
        code = rng.choice(codes)
        site = rng.choice(list(SITES))
        env = rng.choices(list(ENVS), weights=[6, 3, 1])[0]
        role = rng.choices(role_names, weights=weights)[0]
        category, zone, _ = ROLES[role]
        if env == "d":
            zone = "개발망"
        hostname = next_name(site, env, code, role)
        pidx = codes.index(code)
        ip = f"10.{(1 if site == 'a1' else 11) + list(ENVS).index(env)}.{pidx % 250}.{seq[(site, env, code, role)] + 10 * role_names.index(role)}"
        status = rng.choices(["운영", "구축중", "폐기예정"], weights=[95, 3, 2])[0]
        rows.append(server_row(hostname, category, zone, project_names[code], site, ip, status))

    # 일부러 넣는 품질 문제 (검증·준비도 테스트용)
    n = len(rows)
    for i in rng.sample(range(n), max(1, n // 200)):
        rows[i][1] = ""  # 호스트명 누락
    for i in rng.sample(range(n), max(1, n // 300)):
        rows[i][2] = rng.choice(["10.1.300.1", "미할당", "N/A"])  # 잘못된 IP
    for i in rng.sample(range(n), max(1, n // 100)):
        rows[i][9] = ""
        rows[i][10] = ""  # 용량산정 입력 누락
    for i in rng.sample(range(n), max(1, n // 150)):
        rows[i][1] = f"{rng.choice(SYLLABLES)}_legacy{i}"  # 명명 규칙 위반
    for i in rng.sample(range(1, n), max(1, n // 400)):
        rows[i][1] = rows[i - 1][1]  # 호스트명 중복
    return rows[:count]


def write_xlsx(path: str | Path, rows: list[list[str]], sheet: str = "자산목록") -> Path:
    wb = Workbook(write_only=True)
    ws = wb.create_sheet(sheet)
    for r in TITLE_ROWS:
        ws.append(r)
    ws.append(HEADERS)
    for r in rows:
        ws.append(r)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


def drift_rows(rows: list[list[str]], seed: int = 1, change: float = 0.02, remove: float = 0.01, add: int = 40) -> list[list[str]]:
    """다음 동기화 시점 흉내: 일부 자산 삭제·속성 변경·신규 추가. 실행 간 diff 시연·테스트용."""
    rng = random.Random(seed)
    out = [list(r) for r in rows]
    n = len(out)
    drop = set(rng.sample(range(n), int(n * remove)))
    for i in rng.sample(range(n), int(n * change)):
        if i in drop or not out[i][1]:
            continue
        field = rng.choice([6, 10, 15, 16])  # OS, 메모리, 담당자, 운영상태
        out[i][field] = {6: rng.choice(OSES), 10: str(rng.choice([64, 128, 256])), 15: rng.choice(OWNERS), 16: rng.choice(["운영", "폐기예정"])}[field]
    out = [r for i, r in enumerate(out) if i not in drop]
    for k in range(add):
        mfr, model, cpu, sockets, cores = rng.choice(SERVERS)
        out.append(
            [
                f"AS-9{k:05d}",
                f"a1p-new{k % 4}-was{k + 1:02d}",
                f"10.1.250.{k + 1}",
                "서버",
                mfr,
                model,
                rng.choice(OSES),
                cpu,
                str(sockets),
                str(sockets * cores),
                "128",
                SITES["a1"],
                "Z01",
                "업무망",
                f"NEW{k % 4} 시스템",
                rng.choice(OWNERS),
                "구축중",
                "2026-10-01",
                "",
            ]
        )
    return out
