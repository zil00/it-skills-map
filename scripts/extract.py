"""Stage 3 (v1) — rule-based extraction: jobs.description -> requirement fields,
job_skills, unmapped_skills. No AI, no API cost.

Re-run any time (rebuilds job_skills + unmapped_skills, overwrites extracted fields).
Usage: python scripts/extract.py
"""
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from init_db import connect  # noqa: E402

RULES_VERSION = "rules-v3"

# --------------------------------------------------------------------------- #
# Skill matching
# --------------------------------------------------------------------------- #
# Aliases that must match with exact case (lowercase forms are common words).
CASE_SENSITIVE = {
    "ad": "AD", "av": "AV", "mem": "MEM", "sap": "SAP", "ado": "ADO", "snow": "SNOW",
    "mac": "Mac", "macs": "Macs", "ios": "iOS", "sip": "SIP", "osi": "OSI",
    "elastic": "Elastic", "falcon": "Falcon", "sentinel": "Sentinel",
    "defender": "Defender", "exchange": "Exchange", "excel": "Excel", "pam": "PAM",
    "iam": "IAM", "mcp": "MCP", "fcp": "FCP", "catalyst": "Catalyst", "nexus": "Nexus",
    "panorama": "Panorama", "orion": "Orion", "elk": "ELK", "mde": "MDE", "edr": "EDR",
    "it": "IT", "apple": "Apple", "entra": "Entra", "garde": "garde", "mdt": "MDT",
    "wds": "WDS", "pxe": "PXE", "stp": "STP", "lan": "LAN", "wan": "WAN", "ioc": "IOC",
    "iocs": "IOCs", "sso": "SSO", "mfa": "MFA", "erp": "ERP", "crm": "CRM", "pci": "PCI",
    "aks": "AKS", "eks": "EKS", "s3": "S3", "ec2": "EC2", "tfs": "TFS", "jsm": "JSM",
    "aad": "AAD", "gpo": "GPO", "gpos": "GPOs", "mfp": "MFP", "mfps": "MFPs",
    "l1": "L1", "l2": "L2", "l3": "L3", "sla": "SLA", "slas": "SLAs", "dns": "DNS",
    "vpn": "VPN", "vpns": "VPNs", "vms": "VMs", "rmm": "RMM", "nist": "NIST",
    "cism": "CISM", "cisa": "CISA", "ceh": "CEH", "vcp": "VCP", "itam": "ITAM",
    "cmdb": "CMDB", "sccm": "SCCM", "mecm": "MECM", "tier i": "Tier I", "tier ii": "Tier II",
    "wlan": "WLAN", "edr": "EDR", "xdr": "XDR", "html": "HTML", "css": "CSS", "iis": "IIS",
    "java": "Java", "api": "API", "apis": "APIs", "soap": "SOAP",
    "json": "JSON", "xml": "XML", "rdp": "RDP", "bash": "Bash", "python": "Python",
    # added in rules-v2
    "ai": "AI", "ia": "IA", "ip": "IP", "ir": "IR", "dr": "DR", "san": "SAN", "nas": "NAS",
    "nat": "NAT", "chef": "Chef", "helix": "Helix", "ids": "IDS", "ips": "IPS", "ics": "ICS",
    "pim": "PIM", "ttp": "TTP", "ttps": "TTPs", "csf": "CSF", "sox": "SOX", "apm": "APM",
    "plc": "PLC", "plcs": "PLCs", "word": "Word", "outlook": "Outlook", "slack": "Slack",
    "remedy": "Remedy", "spl": "SPL", "mdr": "MDR", "waf": "WAF", "nac": "NAC", "rca": "RCA",
    "iac": "IaC|IAC", "ci": "CI", "cd": "CD", "avd": "AVD", "rpo": "RPO", "rto": "RTO",
    "arp": "ARP", "radius": "RADIUS", "ise": "ISE", "ot": "OT", "dlp": "DLP", "mdm": "MDM",
    "visio": "Visio", "agile": "Agile|agile", "storage": "storage|Storage",
    "puppet": "Puppet", "zoom": "Zoom", "rds": "RDS", "sdn": "SDN", "dfs": "DFS", "psa": "PSA", "sop": "SOP", "rma": "RMA", "lte": "LTE", "perl": "Perl", "vba": "VBA", "php": "PHP", "ics": "ICS", "proxy": "proxy|Proxy", "f5": "F5",
}
# Extra regex conditions appended after specific aliases.
NOT_FOLLOWED = {
    "excel": r"(?!\s+(?:in|at)\b)",
    "a+": r"(?!\s*(?:grade|rating|average))",
    "sql": r"(?!\s+server)",
    "windows": r"(?!\s+(?:server|and\s+doors))",
    "routing": r"(?!\s+(?:number|of\s+calls|calls|tickets|of\s+tickets|requests))",
    "fiber": r"(?!\s+(?:of|bundle))",
    "lifting": r"(?!\s+(?:each\s+other|others))",
    "imaging": r"(?!\s+(?:center|centre|department|services))",
    "word": r"(?!\s+(?:of|choice|count|for))",
    "ip": r"(?!\s+(?:law|rights|portfolio))",
    "ai": r"(?!\s+(?:to\s+(?:screen|assess|review)|may\s+be\s+used|is\s+used\s+in\s+(?:our\s+)?(?:recruit|hiring)))",
    "agile": r"(?!\s+(?:et|and|,)\s)",
    "storage": r"(?!\s+(?:room|space|facility|facilities|of\s+(?:files|records)))",
}
WORDCH = r"A-Za-z0-9_"


def alias_regex(alias: str) -> str:
    body = re.escape(CASE_SENSITIVE.get(alias, alias)) if "|" not in CASE_SENSITIVE.get(alias, "") \
        else CASE_SENSITIVE[alias]
    body = body.replace(r"\ ", r"[\s\-]+") if " " in alias else body
    if alias in CASE_SENSITIVE:
        body = f"(?-i:{body})"
    left = f"(?<![{WORDCH}])" if alias[0].isalnum() else ""
    right = f"(?![{WORDCH}+])" if alias[-1].isalnum() else f"(?![{WORDCH}])"
    return left + body + right + NOT_FOLLOWED.get(alias, "")


TOKEN = re.compile(r"[a-z0-9]+")


class SkillMatcher:
    """Each alias has its own regex; aliases are indexed by their first word so a line
    only tests the aliases whose first word occurs in it. Longest match wins on overlap."""

    def __init__(self, con):
        self.alias_to_skill = dict(con.execute("SELECT alias, skill_id FROM skill_aliases"))
        self.index = defaultdict(list)
        for a in self.alias_to_skill:
            key = TOKEN.search(a).group(0)
            self.index[key].append((a, re.compile(alias_regex(a), re.I)))

    def find(self, text):
        toks = set(TOKEN.findall(text.lower()))
        hits = []
        for t in toks:
            for alias, rx in self.index.get(t, ()):
                for m in rx.finditer(text):
                    hits.append((m.start(), m.end(), alias, m))
        hits.sort(key=lambda h: (-(h[1] - h[0]), h[0]))
        taken = []
        for s, e, alias, m in hits:
            if any(s < te and ts < e for ts, te in taken):
                continue
            taken.append((s, e))
            yield self.alias_to_skill[alias], m

    def is_known(self, phrase: str) -> bool:
        p = phrase.lower().strip()
        return p in self.alias_to_skill or any(True for _ in self.find(phrase))


# --------------------------------------------------------------------------- #
# Sections & context
# --------------------------------------------------------------------------- #
ASSET_HEAD = re.compile(
    r"nice[\s-]to[\s-]have|\bassets?\b|\bpreferred\b|\bbonus\b|desir(?:ed|able)|"
    r"\batouts?\b|\bplus\b|good[\s-]to[\s-]haves?|great[\s-]to[\s-]haves?|would be great|"
    r"additional (?:skills|qualifications)|extra credit|stand out|set you apart|"
    r"what would make you|ideal(?:ly)?|souhaitable|un plus|privilégi|souhaité|"
    r"recommended|optional|bonus points", re.I)
REQ_HEAD = re.compile(
    r"requirements?|qualifications?|must[\s-]haves?|what you(?:'ll)? (?:bring|need|have)|"
    r"who you are|about you|you have|you bring|skills|experience|"
    r"what we(?:'re| are) looking for|what we need|exigences|profil recherché|"
    r"compétences|qualifications requises|ce que vous apportez|votre profil|"
    r"education|knowledge|competencies|responsibilities|duties|what you(?:'ll)? do|"
    r"role|the job|key accountabilities|tâches|responsabilités|mandat|"
    r"you will|in this role|day to day|day-to-day", re.I)
EXCL_HEAD = re.compile(
    r"\babout (?!(?:the |this |our )?(?:role|position|job|opportunit|you\b|team\b|work\b))"
    r"[\w&.,'’\- ]{1,40}$|who we are|"
    r"à propos (?!(?:de |du |d')?(?:ce |cet |du |le )?(?:poste|rôle|emploi|mandat))|"
    r"\bbenefits\b|perks|what we offer|why (?:join|work)|\bwhy [\w&.'\- ]{1,30}\?$|our offer|we offer|"
    r"utilisation (?:de l')?ia|"
    r"equal opportunit|employment equity|accommodat|diversity|inclusion|"
    r"ce que nous offrons|avantages|qui sommes-nous|pourquoi|"
    r"compensation|salary|pay range|\bpay\b|rémunération|our commitment|how to apply|"
    r"privacy|disclaimer|life at|our culture|our values|land acknowledg|"
    r"artificial intelligence|intelligence artificielle|\bai usage|use of ai|about ai|"
    r"how we hire|work authori[sz]ation|autorisation de travail|déclaration", re.I)
ASSET_INLINE = re.compile(
    r"\bassets?\b|\bpreferred\b|nice[\s-]to[\s-]have|\ba plus\b|\bis a plus\b|"
    r"\bbonus\b|desirable|\bdesired\b|\batouts?\b|un atout|advantage(?:ous)?|"
    r"beneficial|would be (?:great|nice|helpful)|\bideally\b|not required|"
    r"\bpreferably\b|souhaitable|\boptional\b|\bhelpful\b|"
    r"\brecommended\b|privilégié|un plus|\bwould be an asset|serait un atout|"
    r"préférence sera accordée|preference (?:will|may) be given|\bis desired\b", re.I)
BOILERPLATE_LINE = re.compile(
    r"(?=.*(?:\bAI\b|\bIA\b|artificial intelligence|intelligence artificielle))"
    r"(?=.*(?:recruit|screening|hiring|\bhire\b|applicant|candidat|résumé|resume|interview|recrutement))|"
    r"equal opportunit|accommodation|accessible|disabilit|indigenous|"
    r"we thank all applicants|only those selected|visible minorit|"
    r"protected (?:veteran|characteristic)|regardless of|à l'égalité|"
    r"privacy|personal information|terms of use", re.I)


def is_header(line: str) -> bool:
    if re.match(r"\s*[-•*·◦▪●–]\s", line):        # bullet items are never headers
        return False
    s = line.strip().strip("*#•-–").strip()
    if not s or len(s) > 70:
        return False
    words = s.split()
    if s.endswith(":") and len(words) <= 9:
        return True
    return len(words) <= 6 and not re.search(r"[.;,]$", s) and (s.isupper() or s.istitle() or
                                                                 bool(REQ_HEAD.search(s) or ASSET_HEAD.search(s) or EXCL_HEAD.search(s)))


BULLET = re.compile(r"\s*[-•*·◦▪●–]\s")


def segments(text: str):
    """Yield (line, ctx) with ctx in {'req','asset','excl','neutral'}."""
    ctx = "neutral"
    # Split headers glued to the previous sentence: '...questions.Nice to Haves:'
    text = re.sub(r"(?<=[a-z0-9.)])(?=(?:Nice[\s-]to[\s-]Haves?|Bonus Points|Preferred Qualifications|"
                  r"Assets|You'll be a good fit[^:\n]{0,30}|Requirements|Qualifications)\s*:)", "\n", text or "")
    lines = [l.strip() for l in re.split(r"\n+", text or "") if l.strip()]
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        short_head = (len(line.split()) <= 4 and line[0].isupper() and not re.search(r"[.;,!?]$", line)
                      and bool(BULLET.match(nxt)) and not BULLET.match(line))
        if is_header(line) or short_head:
            head = line.rstrip(":")
            if EXCL_HEAD.search(head):
                ctx = "excl"
            elif ASSET_HEAD.search(head):
                ctx = "asset"
            elif REQ_HEAD.search(head):
                ctx = "req"
            elif line.endswith(":") or short_head or head.istitle() or head.isupper():
                ctx = "neutral"
            continue
        # inline header "Assets: ...", "Nice to have: ..."
        m = re.match(r"^([^:]{2,40}):\s+\S", line)
        line_ctx = ctx
        if m:
            h = m.group(1)
            if ASSET_HEAD.search(h):
                line_ctx = "asset"
            elif EXCL_HEAD.search(h):
                line_ctx = "excl"
        if line_ctx != "excl" and BOILERPLATE_LINE.search(line):
            line_ctx = "excl"
        yield line, line_ctx


def clause_is_asset(line: str, start: int, end: int) -> bool:
    """Asset marker in the same sentence/clause as the match."""
    left = max(line.rfind(". ", 0, start), line.rfind("; ", 0, start))
    right_candidates = [i for i in (line.find(". ", end), line.find("; ", end)) if i != -1]
    right = min(right_candidates) if right_candidates else len(line)
    return bool(ASSET_INLINE.search(line[left + 1:right]))


# --------------------------------------------------------------------------- #
# Field extractors
# --------------------------------------------------------------------------- #
NUMWORDS = {"une": 1, "huit": 8, "dix": 10, "sept": 7, "six": 6, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
            "eight": 8, "nine": 9, "ten": 10, "un": 1, "deux": 2, "trois": 3, "quatre": 4,
            "cinq": 5, "a": 1, "an": 1}
NUM = r"(\d{1,2}(?:\.\d)?|one|two|three|four|five|six|seven|eight|nine|ten|une|un|deux|trois|quatre|cinq|sept|huit|dix)"
YEARS_RX = re.compile(
    rf"(?:minimum(?:\s+of)?|at\s+least|min\.?)?\s*\(?{NUM}\)?\s*\+?\s*"
    rf"(?:(?:-|–|to|à|or)\s*\(?{NUM}\)?\s*\+?\s*)?"
    r"(?:\+\s*)?(?:years?|yrs?|ans|année?s)\b(?:\s*\+)?", re.I)
EXP_WORD = re.compile(r"experience|expérience|exp\.|working in|work(?:ing)? with|hands-on|"
                      r"background|track record|in (?:a|an) [\w\s/-]{0,30}(?:role|position|environment)|"
                      r"supporting|in it\b|in (?:the )?(?:field|industry)|of (?:it|technical|help|service|desktop)",
                      re.I)
NOT_EXP = re.compile(r"\b(?:old|age|ago|warranty|in business|founded|history|anniversary|"
                     r"since|over the (?:past|last|next)|for (?:the )?(?:past|next)|"
                     r"trusted|serving|serv(?:ed|ing) (?:clients|customers)|tenure|"
                     r"company|organization|we have been|legacy|celebrat)", re.I)


def to_num(s):
    s = s.lower()
    return float(NUMWORDS[s]) if s in NUMWORDS else float(s)


def extract_years(lines):
    found_req, found_any = [], []
    for line, ctx in lines:
        if ctx == "excl":
            continue
        for m in YEARS_RX.finditer(line):
            lo = to_num(m.group(1))
            hi = to_num(m.group(2)) if m.group(2) else None
            window = line[max(0, m.start() - 60): m.end() + 80]
            if not EXP_WORD.search(window) or NOT_EXP.search(window):
                continue
            if lo > 20 or (hi is not None and (hi > 20 or hi < lo)):
                continue
            item = (lo, hi)
            found_any.append(item)
            if ctx != "asset" and not clause_is_asset(line, m.start(), m.end()):
                found_req.append(item)
    # The first required mention in document order is usually the overall requirement
    # ("3+ years in IT support"); later ones tend to be per-skill ("1+ year with X").
    use = found_req or found_any
    if not use:
        return None, None
    return use[0]


EDU_PATTERNS = [
    ("none", re.compile(r"high[\s-]school|secondary school|\bGED\b|grade 12|"
                        r"diplôme d'études secondaires|(?-i:\bDES\b)", re.I)),
    ("diploma", re.compile(r"(?<!high school )(?<!high-school )\bdiplomas?\b|"
                           r"\bcollege\b|post[\s-]?secondary|(?-i:\b(?:DEC|AEC|DEP)\b)|"
                           r"associate(?:'s)? degree|technical (?:school|institute)|"
                           r"\bcertificate program|technique en informatique|"
                           r"collégial|cégep|cegep", re.I)),
    ("bachelor", re.compile(r"bachelor|baccalaur|\bB\.?\s?Sc\b|\bB\.?\s?Eng\b|\bBCom\b|"
                            r"university degree|undergraduate degree|(?:4|four)[\s-]year degree|"
                            r"(?:related|relevant|technical|computer science|engineering|"
                            r"university|IT|a|an)\s+degree\b|"
                            r"\bdegree\s+(?:in|or|from|with|and|program|preferred|required)|"
                            r"diplôme universitaire|grade universitaire", re.I)),
    ("master", re.compile(r"master'?s?\s+(?:degree|of)|\bM\.?\s?Sc\b|\bMBA\b|maîtrise (?:en|universitaire)", re.I)),
]
EDU_RANK = {"none": 0, "diploma": 1, "bachelor": 2, "master": 3}


def extract_education(lines):
    req, anyl = set(), set()
    for line, ctx in lines:
        if ctx == "excl":
            continue
        if re.search(r"high degree|degree of (?:autonomy|independence|accuracy|"
                     r"flexibility|discretion|professionalism)|360[\s-]degree", line, re.I):
            line = re.sub(r"high degree|degree of \w+|360[\s-]degree", "", line, flags=re.I)
        for level, rx in EDU_PATTERNS:
            for m in rx.finditer(line):
                if level == "diploma" and re.search(r"high[\s-]school\s*$", line[:m.start()], re.I):
                    continue
                anyl.add(level)
                if ctx != "asset" and not clause_is_asset(line, m.start(), m.end()):
                    req.add(level)
    # Education mentioned only as an asset is not a requirement.
    if not req:
        return "unspecified"
    return min(req, key=EDU_RANK.get)


REMOTE_HYBRID = re.compile(
    r"\bhybrid\b(?!\s+(?:cloud|environments?|infrastructure|it\b|networks?|"
    r"identit|ad\b|active directory|exchange|deployments?|architecture|"
    r"workforce environment|setup|solutions?|systems?))|\bhybride\b(?!\s+(?:infonuagique|cloud))|"
    r"\d\s*(?:days?|jours?)\s*(?:a|per|par)\s*(?:week|semaine)\s*(?:in|at|on|au|en)\b|"
    r"in[\s-](?:the[\s-])?office\s+\d|\d\s+days?\s+(?:in[\s-](?:the[\s-])?office|on[\s-]?site)|"
    r"mode hybride|travail hybride", re.I)
REMOTE_FULL = re.compile(
    r"(?:fully|100\s?%|completely|entirely|permanently)\s+remote|"
    r"remote[\s-](?:first|position|role|job|opportunity|work(?:ing)?\b|based|employee)|"
    r"work(?:ing)?\s+(?:from|at)\s+home|(?:expected|able) to work remotely|this (?:is a )?remote|work[\s-]from[\s-]anywhere|\bWFH\b|"
    r"\(remote\)|remote\s*\(|location:\s*remote|"
    r"100\s?%\s+(?:en\s+)?télétravail|télétravail (?:complet|à temps plein|à 100)", re.I)
REMOTE_ONSITE = re.compile(
    r"\bon[\s-]?site\b|\bin[\s-]office\b|\bin[\s-]person\b|office[\s-]based|"
    r"\bsur place\b|en présentiel|\bpresentiel\b|work(?:ing)? from (?:our|the) office|"
    r"report to (?:the|our) office|this (?:is|role is) not (?:a )?remote", re.I)


def extract_remote(title, location, lines):
    head = f"{title} {location}"
    if re.search(r"\bhybrid|hybride", head, re.I):
        return "hybrid"
    if re.search(r"\bremote\b|télétravail", head, re.I):
        return "remote"
    if re.search(r"on[\s-]?site|in[\s-]office", head, re.I):
        return "onsite"
    # Strong signals in the job text first; perks sections ("telecommuting", "télétravail")
    # are only a weak hint for hybrid when nothing explicit is said.
    main = "\n".join(l for l, c in lines if c != "excl")
    perks = "\n".join(l for l, c in lines if c == "excl" and re.search(r"remote|hybri|on-?site|office|télétravail", l, re.I))
    for text in (main, perks):
        if REMOTE_HYBRID.search(text):
            return "hybrid"
        if REMOTE_FULL.search(text):
            return "remote"
        if REMOTE_ONSITE.search(text):
            return "onsite"
    if REMOTE_WEAK.search(main + "\n" + perks):
        return "hybrid"
    return "unknown"


REMOTE_WEAK = re.compile(r"\btélétravail\b|telecommut|remote work options?|flexible work(?:ing)? (?:arrangement|option|model)s?|"
                         r"work from home (?:days|options?|flexibility)", re.I)


SENIORITY_TITLE = [
    ("lead", re.compile(r"\b(?:lead|manager|supervisor|head of|director|chef|"
                        r"superviseur|gestionnaire|team leader|architect)\b", re.I)),
    ("senior", re.compile(r"\b(?:senior|sr\.?|iii|iv|level\s*(?:3|iii)|tier\s*(?:3|iii)|l3|"
                          r"principal|principale|expert|sénior|staff)\b", re.I)),
    ("entry", re.compile(r"\b(?:junior|jr\.?|entry[\s-]level|entry|intern|internship|co-?op|"
                         r"student|apprentice|apprenticeship|trainee|graduate|new grad|"
                         r"level\s*(?:1|i)|tier\s*(?:1|i)|l1|stagiaire|stage|débutant|"
                         r"i)\b(?!\s*/)", re.I)),
    ("mid", re.compile(r"\b(?:ii|intermediate|level\s*(?:2|ii)|tier\s*(?:2|ii)|l2|"
                       r"intermédiaire)\b", re.I)),
]


def extract_seniority(title, linkedin, years, employment):
    t = title
    for level, rx in SENIORITY_TITLE:
        m = rx.search(t)
        if m:
            # Roman "I" only as a trailing level marker, not the pronoun.
            if m.group(0).lower() == "i" and not re.search(r"\bI\s*$|\bI\s*[-,(|]", t):
                continue
            return level
    if employment in ("co-op", "internship", "apprenticeship"):
        return "entry"
    if years is not None:
        if years <= 2:
            return "entry"
        if years <= 5:
            return "mid"
        return "senior"
    ls = (linkedin or "").lower()
    if ls in ("entry level", "internship"):
        return "entry"
    if ls in ("associate", "mid-senior level"):
        return "mid"
    if ls in ("director", "executive"):
        return "lead"
    return "unknown"


FLAG_RX = {
    "bilingual": re.compile(
        r"bilingu(?:al|e|ism)|english\s+(?:and|&)\s+french|french\s+(?:and|&)\s+english|"
        r"(?:fluen\w*|proficien\w*|knowledge|command|communicate)\s+(?:in|of)\s+(?:both\s+)?french|"
        r"french(?:\s+language)?\s+(?:is\s+)?(?:required|mandatory|essential|skills|proficiency)|"
        r"(?:written|spoken|oral)\s+(?:and\s+(?:written|spoken|oral)\s+)?french|"
        r"français\s+et\s+(?:en\s+|de\s+)?(?:l')?anglais|anglais\s+et\s+(?:en\s+|du\s+)?(?:le\s+)?français|"
        r"(?:both|in)\s+(?:official\s+)?languages|"
        r"(?:fluen\w*|proficien\w*)\s+in\s+(?:english|both)\s+(?:and|&)\s+french", re.I),
    "clearance": re.compile(
        r"security clearance|reliability (?:status|clearance|check)|secret (?:level |security )?clearance|"
        r"\btop secret\b|enhanced reliability|\bclearance\b|cote de (?:sécurité|fiabilité)|"
        r"controlled goods|nato secret", re.I),
    "license": re.compile(
        r"driver'?s?'?\s+licen[cs]e|driving licen[cs]e|class\s+(?:5|g|g2)\s+(?:driver'?s?\s+)?licen[cs]e|"
        r"\bG\s+licen[cs]e|valid licen[cs]e|permis de conduire|own (?:a )?vehicle|reliable vehicle|"
        r"access to (?:a|your own) vehicle|reliable transportation", re.I),
    "shift": re.compile(
        r"on[\s-]call|shift work|rotating shifts?|night shifts?|evening shifts?|weekend shifts?|"
        r"(?:work|various|different|flexible|day|evening|night|weekend|rotating|\d+[\s-]hours?)\s+shifts|"
        r"shift (?:schedule|rotation)|24\s?/\s?7|24x7|after[\s-]hours|out[\s-]of[\s-]hours|overnight|"
        r"evenings?\s+(?:and|&|or|,)\s+weekends?|"
        r"weekends?\s+(?:and|&|or)\s+(?:evenings?|holidays)|rotating schedule|standby|"
        r"\bde garde\b|quarts? de travail|horaire rotatif|soirs? et (?:les )?fins? de semaine", re.I),
}


# In a French-language posting, requiring English means the job needs both languages.
FR_NEEDS_ENGLISH = re.compile(
    r"maîtrise\s+(?:de\s+)?l'anglais|connaissance\s+de\s+l'anglais|anglais\s+(?:fonctionnel|"
    r"parlé|écrit|avancé|intermédiaire|requis|obligatoire|essentiel)|"
    r"(?:communiquer|travailler)\s+en\s+anglais", re.I)


def extract_flag(name, title, lines, lang=None):
    if name == "bilingual" and re.search(r"bilingu", title, re.I):
        return 1
    rx = FLAG_RX[name]
    if name == "bilingual" and lang == "fr":
        rx = re.compile(rx.pattern + "|" + FR_NEEDS_ENGLISH.pattern, re.I)
    seen_asset = False
    for line, ctx in lines:
        if ctx == "excl":
            continue
        for m in rx.finditer(line):
            if ctx == "asset" or clause_is_asset(line, m.start(), m.end()):
                seen_asset = True
            else:
                return 1
    return 0 if seen_asset else None


MONEY = r"\$\s?(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?|\d{2,3}(?:\.\d+)?\s?[kK]|\d{2,3}(?:\.\d{1,2})?)"
SAL_RANGE = re.compile(MONEY + r"\s*(?:CAD|CDN)?\s*(?:-|–|—|to|and)\s*" + MONEY, re.I)
# "72 642,70 $ à 121 070,30 $", "47,000 $ à 71,500 $"
SAL_RANGE_FR = re.compile(r"(\d{2,3}[\s\u00a0\u202f,]\d{3}(?:,\d{2})?|\d{2,3}(?:,\d{2})?)\s?\$\s*(?:-|–|à)\s*"
                          r"(\d{2,3}[\s\u00a0\u202f,]\d{3}(?:,\d{2})?|\d{2,3}(?:,\d{2})?)\s?\$", re.I)
# "60,000 CAD to 90,000 CAD" (no $ sign)
SAL_RANGE_CAD = re.compile(r"(\d{2,3},\d{3}|\d{2,3}\s?[kK])\s*(?:CAD|CDN)\s*(?:-|–|—|to)\s*\$?\s?"
                           r"(\d{2,3},\d{3}|\d{2,3}\s?[kK])\s*(?:CAD|CDN)", re.I)
SAL_SINGLE = re.compile(r"(?:salary|compensation|pay|rate|wage|salaire|starting at|up to)[^.$\n]{0,40}"
                        + MONEY, re.I)
HOURLY_CTX = re.compile(r"/\s*h(?:ou)?r|per\s+hour|an\s+hour|hourly|/\s*heure|de l'heure|l'heure", re.I)


def money(s, fr=False):
    s = s.replace(" ", "").replace(" ", "").replace(" ", "")
    if fr and not re.fullmatch(r"\d{1,3},\d{3}", s):     # "47,000" = thousands; "25,50" = decimal
        s = s.replace(",", ".")
    k = s.lower().endswith("k")
    s = s.rstrip("kK").replace(",", "")
    v = float(s)
    return v * 1000 if k else v


def plausible(lo, hi, period):
    if period == "year":
        return 25000 <= lo <= hi <= 350000
    return 14 <= lo <= hi <= 200


def extract_salary(lines):
    not_pay = re.compile(r"bonus|referral|sign[\s-]?on|tuition|allowance|reimburs|stipend|"
                         r"spending account|wellness|budget|prime", re.I)
    for line, ctx in lines:
        if re.search(r"revenue|million|billion|\bfunding\b|raised|\bassets under", line, re.I):
            continue
        for rx, fr in ((SAL_RANGE, False), (SAL_RANGE_FR, True), (SAL_RANGE_CAD, False)):
            for m in rx.finditer(line):
                if not_pay.search(line[max(0, m.start() - 50): m.start()]):
                    continue
                lo, hi = money(m.group(1), fr), money(m.group(2), fr)
                tail = line[m.end(): m.end() + 30]
                period = "hour" if (HOURLY_CTX.search(tail) or hi < 300) else "year"
                if plausible(lo, hi, period):
                    return lo, hi, period
        m = SAL_SINGLE.search(line)
        if m and not not_pay.search(line[max(0, m.start() - 50): m.end()]):
            v = money(m.group(1))
            tail = line[m.end(): m.end() + 30]
            period = "hour" if (HOURLY_CTX.search(tail) or v < 300) else "year"
            if plausible(v, v, period):
                return v, v, period
    return None


# --------------------------------------------------------------------------- #
# Role mapping
# --------------------------------------------------------------------------- #
GENERIC_ALIASES = {"support analyst", "support specialist", "support technician", "support agent",
                   "support representative", "product specialist", "application specialist",
                   "applications specialist", "technology specialist", "systems analyst",
                   "system analyst", "systems specialist", "user support", "it specialist",
                   "technology associate", "it assistant", "technology support", "soc",
                   "cybersecurity", "cyber security", "network support", "support engineer",
                   "escalation engineer", "support associate", "support consultant",
                   "analyste de soutien", "agent de soutien", "technical analyst",
                   "security specialist", "security operations", "information security",
                   "system specialist", "onsite specialist", "analyste technique"}
# Titles that are a different career track even when they contain an IT alias.
EXCLUDE_TITLE = re.compile(
    r"\b(?:business (?:systems? )?analyst|analyste d'affaires|analyste fonctionnel|"
    r"functional analyst|data analyst|financial analyst|developer|développeur|"
    r"software engineer|programmer|programmeur|scrum master|project manager|"
    r"chargé de projet|product manager|product owner|sales engineer|account executive|"
    r"recruiter|instrumentation|biomedical|medical device|field service engineer)", re.I)
NON_IT_TITLE = re.compile(
    r"\b(?:sales|account (?:executive|manager)|marketing|payroll|human resources|\bHR\b|"
    r"recruit|nurse|nursing|clinical|dental|pharmac|accounting|accounts (?:payable|receivable)|"
    r"finance|financial|mortgage|insurance|claims|benefits|customer service representative|"
    r"call cent|bank|teller|mechanic|hvac|electrician|plumb|welder|warehouse|logistics|"
    r"administrative assistant|office assistant|receptionist|legal|paralegal|teacher|"
    r"educator|tutor|retail|store|cashier|driver|construction|medical|veterinar|"
    r"loan|lending|underwrit|investment|wealth|tax|audit|real estate|leasing|hospitality|"
    r"restaurant|chef de cuisine|food|culinary|pilot|aircraft|aviation|automotive|"
    r"biomedical|laborator|scientif|research assistant|social worker|counsel)", re.I)


def normalize_title(title: str) -> str:
    """Strip French gender forms and odd punctuation: 'Administrateur·trice réseau',
    'Technicien(ne)', 'Analyste-e' -> base form."""
    t = title.replace("’", "'")
    t = re.sub(r"\s*\((?:trice|rice|ne|e|euse|se|ère)\)|(?<=\w)[\u00b7.](?:trice|rice|ne|e|euse)(?!\w)|(?<=\w)-(?:ne|e|trice)(?!\w)", "", t)
    t = re.sub(r"[–—|,]", " - ", t)
    return re.sub(r"\s+", " ", t)


class RoleMatcher:
    def __init__(self, con):
        # Specific aliases first (longest first), generic catch-alls last.
        aliases = sorted(con.execute("SELECT alias, role_id FROM role_aliases"),
                         key=lambda r: (r[0] in GENERIC_ALIASES, -len(r[0])))
        self.items = [(a, rid, re.compile(rf"(?<![\w]){re.escape(a.replace("’", "'")).replace(r'\ ', r'[\s/&-]+')}(?![\w])",
                                          re.I)) for a, rid in aliases]

    def match(self, title: str):
        t = normalize_title(title)
        if EXCLUDE_TITLE.search(t):
            return None, None
        # Plain customer-service roles (no technical word in the title) are not IT support.
        if (re.search(r"customer (?:support|service|success|care|experience)|client (?:support|service)", t, re.I)
                and not re.search(r"\b(?:tech\w*|IT|TI|software|systems?|network|desktop|application|"
                                  r"product support|informatique)\b", t, re.I)):
            return None, None
        for alias, rid, rx in self.items:
            if rx.search(t):
                if alias in GENERIC_ALIASES and NON_IT_TITLE.search(t):
                    return None, alias
                return rid, alias
        return None, None


# --------------------------------------------------------------------------- #
# Unmapped-skill candidates
# --------------------------------------------------------------------------- #
LIST_INTRO = re.compile(r"(?:such as|including|includes|e\.g\.?,?|i\.e\.?,?|like|tels? que|"
                        r"notamment|experience (?:with|in|using)|knowledge of|"
                        r"familiarity with|proficiency (?:with|in)|expertise (?:with|in)|"
                        r"connaissance (?:de|des|du)|expérience (?:avec|en))\s+([^.;:\n]{3,160})",
                        re.I)
PAREN = re.compile(r"\(([^()]{2,120})\)")
TECHY = re.compile(r"^(?:[A-Z][a-z]+[A-Z]\w*|[A-Z]{2,6}\d*|[A-Za-z]+\d+[A-Za-z\d-]*|"
                   r"[A-Z][\w.+#-]*(?:\s+[A-Z][\w.+#-]*){0,2})$")
STOP = set("""the a an and or of to in for with on at by as is are be our your their its this that these
those it we you they any all other others etc related various relevant strong good excellent solid
working basic advanced knowledge experience understanding ability skills skill tools tool systems system
technologies technology environment environments including such similar equivalent e.g ie i.e
team teams clients client customers customer users user business new modern multiple both
and/or e.g. more least years year level high plus asset assets preferred required
canada canadian ontario quebec toronto montreal vancouver calgary alberta british columbia
monday friday january december inc ltd corp llc we're you'll you're it's
""".split())


def candidates(line: str):
    chunks = [m.group(1) for m in LIST_INTRO.finditer(line)] + [m.group(1) for m in PAREN.finditer(line)]
    for ch in chunks:
        for item in re.split(r",|/|;|\band\b|\bor\b|\bet\b|\bou\b|\bas well as\b|&", ch):
            item = item.strip(" .:-–()'\"*•")
            item = re.sub(r"^(?:the|a|an|other|various|experience with|knowledge of)\s+", "", item, flags=re.I)
            words = item.split()
            if not (1 <= len(words) <= 4) or len(item) < 2 or len(item) > 40:
                continue
            if all(w.lower() in STOP for w in words):
                continue
            if not TECHY.match(item):
                continue
            yield item


# --------------------------------------------------------------------------- #
def main():
    con = connect()
    con.row_factory = sqlite3.Row
    skills = SkillMatcher(con)
    roles = RoleMatcher(con)

    con.execute("DELETE FROM job_skills")
    con.execute("DELETE FROM unmapped_skills")
    run_id = con.execute(
        "INSERT INTO extraction_runs (run_date, model, prompt_version, notes) VALUES (?,?,?,?)",
        (date.today().isoformat(), "rules", RULES_VERSION, "rule-based extract.py")).lastrowid

    unmapped = Counter()
    unmapped_first = {}
    jobs = con.execute("SELECT id, title_raw, location_raw, description, linkedin_seniority, "
                       "employment_type, salary_min, salary_source, first_seen, language FROM jobs").fetchall()
    for j in jobs:
        title, desc = j["title_raw"], j["description"] or ""
        lines = list(segments(desc))
        role_id, _ = roles.match(title)

        # skills
        found = {}
        for line, ctx in lines:
            if ctx == "excl":
                continue
            for sid, m in skills.find(line):
                asset = ctx == "asset" or clause_is_asset(line, m.start(), m.end())
                req = 0 if asset else 1
                snippet = line[max(0, m.start() - 60): m.end() + 60].strip()
                if sid not in found or (req and not found[sid][0]):
                    found[sid] = (req, snippet)
        for sid, _m in skills.find(title):
            found.setdefault(sid, (1, title))
        con.executemany("INSERT INTO job_skills (job_id, skill_id, required, raw_text) VALUES (?,?,?,?)",
                        [(j["id"], sid, req, snip) for sid, (req, snip) in found.items()])

        # unmapped candidates (count once per job)
        seen = set()
        for line, ctx in lines:
            if ctx == "excl":
                continue
            for c in candidates(line):
                key = c.lower()
                if key in seen or skills.is_known(c):
                    continue
                seen.add(key)
                unmapped[key] += 1
                unmapped_first.setdefault(key, j["first_seen"][:10])

        ymin, ymax = extract_years(lines)
        sal = None if j["salary_source"] == "listed" else extract_salary(lines)
        fields = {
            "role_id": role_id,
            "remote_type": extract_remote(title, j["location_raw"] or "", lines),
            "years_exp_min": ymin,
            "years_exp_max": ymax,
            "education": extract_education(lines),
            "seniority": extract_seniority(title, j["linkedin_seniority"], ymin, j["employment_type"]),
            "bilingual_required": extract_flag("bilingual", title, lines, j["language"]),
            "security_clearance": extract_flag("clearance", title, lines),
            "drivers_license": extract_flag("license", title, lines),
            "shift_or_oncall": extract_flag("shift", title, lines),
            "extraction_run_id": run_id,
        }
        if sal:
            fields.update(salary_min=sal[0], salary_max=sal[1], salary_period=sal[2],
                          salary_currency="CAD", salary_source="description")
        elif j["salary_source"] != "listed":
            fields.update(salary_min=None, salary_max=None, salary_period=None, salary_source=None)
        sets = ", ".join(f"{k} = ?" for k in fields)
        con.execute(f"UPDATE jobs SET {sets} WHERE id = ?", (*fields.values(), j["id"]))

    con.executemany("INSERT INTO unmapped_skills (raw_text, times_seen, first_seen) VALUES (?,?,?)",
                    [(k, n, unmapped_first[k]) for k, n in unmapped.items()])
    con.execute("UPDATE extraction_runs SET jobs_processed = ? WHERE id = ?", (len(jobs), run_id))
    con.commit()

    q = lambda s: con.execute(s).fetchone()[0]  # noqa: E731
    print(f"{RULES_VERSION}: {len(jobs)} jobs, run_id={run_id}")
    print(f"  in scope: {q('SELECT COUNT(*) FROM jobs WHERE role_id IS NOT NULL')}"
          f"  | with >=1 skill: {q('SELECT COUNT(DISTINCT job_id) FROM job_skills')}"
          f"  | avg skills/job: {q('SELECT ROUND(1.0*COUNT(*)/(SELECT COUNT(*) FROM jobs),1) FROM job_skills')}")
    print(f"  years found: {q('SELECT COUNT(*) FROM jobs WHERE years_exp_min IS NOT NULL')}"
          f"  | salary: {q('SELECT COUNT(*) FROM jobs WHERE salary_min IS NOT NULL')}"
          f"  | remote known: {q(chr(39).join(['SELECT COUNT(*) FROM jobs WHERE remote_type != ', 'unknown', '']))}"
          f"  | education known: {q(chr(39).join(['SELECT COUNT(*) FROM jobs WHERE education != ', 'unspecified', '']))}")
    print(f"  unmapped candidates: {len(unmapped)} distinct")


if __name__ == "__main__":
    main()
