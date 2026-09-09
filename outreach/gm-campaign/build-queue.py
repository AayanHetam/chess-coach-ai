#!/usr/bin/env python3
"""
Build queue-remaining.jsonl: one fully-rendered email per line, ready to send
verbatim with no template logic at send time.

Guarantees enforced here (see README rules):
  - one email per HUMAN, not per address (spans already-sent people too)
  - never re-mail an address in sent-log*.tsv
  - salutation is hand-curated where the automatic surname rule is unsafe
  - no BCC (removed per Aayan 2026-09-09)
"""
import csv, json, re, sys, unicodedata
from collections import OrderedDict

CONTACTS = "gm-contacts.csv"
SENT_LOGS = ["sent-log.tsv", "sent-log-batch2.tsv"]
OUT = "queue-remaining.jsonl"

SUBJECT = "AI Chess Coach for Societal Good"

# Verbatim from sent message 1a084162396363da (batch 2, #50). Only {SAL} and
# {TTL} vary.
PARAS = [
    "{SAL}",
    "My name is Aayan Hetamsaria. I am a 16 year old in Seattle who grew up in Mumbai. I saw first-hand the half-naked children and frail women sleeping on the streets.",
    "Today, chess coaching has become overly expensive, with some coaches charging over $200/hour. I built a free AI chess coach called Chess Masti to help give these children that do not have that kind of money a powerful resource to learn, train and play chess. We directly raise money for the Akanksha Education Fund, a 501(c)(3) that funds such schools for under-resourced kids in Mumbai and Pune.",
    "I would be permanently indebted to you if you could try out the AI for 15 minutes and give me some feedback. {TTL} can help grow this product's impact exponentially.",
    "The site is chessmasti.com",
    "Thank you so much for your time and attention. If you are willing to give me a quick line about why you like the product, that would be deeply appreciated.",
    "Thank you so much!",
    "Sincerely,",
    "Aayan Hetamsaria",
]

# Scraper-mangled addresses. The label prefix / typo domain cannot be repaired
# without guessing, and this campaign never guesses an address, so these three
# are held out for a manual browser lookup (see needs-manual-lookup.csv).
MANGLED = {
    "slot-rkn.rajesh5555@gmail.com",        # label prefix "Slot-"
    "hour...robertomiramontes1977@gmail.com",  # label prefix "HOUR..."
    "chessdomi10@gamil.com",                # typo domain, gamil.com is a squat
}

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# ---------------------------------------------------------------- salutations
# Hand-curated surnames. Every name whose surname the "last token of a clean
# two-token latin name" rule cannot get right is listed here explicitly.
# Value None means: use the full name (Ethiopian / Vietnamese / South Indian
# initial forms where reducing to a surname would be wrong).
SURNAME = {
    # Cyrillic — Firstname Lastname, except Гармаш Алёна which is reversed
    "Гармаш Алёна": "Гармаш",
    # Hungarian / Armenian / Russian written surname-first
    "Péczely Sebastian Zsombor": "Péczely",
    "Manukyan Sargis A.": "Manukyan",
    "Makarov Pavel (Pavlo)": "Makarov",
    "VMU (Usmanov V.)": "Usmanov",
    # scraper noise glued to the name
    "Ismael Vidal ID FIDE: 3901718": "Vidal",
    "Walter Cuevas ID FIDE 3405028": "Cuevas",
    "Arena International Master César Arturo Rosas García": "Rosas",
    "/ AGM / FI / FA / NA / AO Alvin Alcala": "Alcala",
    "CM McLean Handjaba": "Handjaba",
    "FT Hemant Sharma": "Sharma",
    "Dr. Norbert Barth": "Barth",
    # Hispanic 4-token: Given Given Paternal Maternal -> paternal
    "Juan Pedro CORDON GUTIERREZ": "Cordon",
    "Lorner Jesus Acosta Villarroel": "Acosta",
    "Alberto Jesús López Rodríguez": "López",
    "Boris Alexei Martinez Alpizar": "Martinez",
    "Daniel José Ledezma Borregales": "Ledezma",
    "Franklin Annervys Palomo Chess": "Palomo",
    "Gabriel Antonio Salazar Olchowski": "Salazar",
    "Gabriel Enrique Ledezma Villamizar": "Ledezma",
    "Joaquin Ignacio Miranda Camus": "Miranda",
    "Jose Luis Castro Torres": "Castro",
    "Juan David Becerra Morales": "Becerra",
    "Julian Andes Gallego Vasquez": "Gallego",
    "LUIS ENRIQUE VALDES MARTIN": "Valdes",
    "Luis David Jiménez Almeida": "Jiménez",
    "Luis Enrique Valle Maytin": "Valle",
    "Mario Enrique Diéguez Álvarez": "Diéguez",
    "Miguel Orlando Chaviano Espina": "Chaviano",
    "Ramón Alberto Hernández Fernández": "Hernández",
    "José Gabriel Cardoso Cardoso": "Cardoso",
    "Juan Sebastián Melián Rodríguez": "Melián",
    "Lazaro Antonio Bueno Perez": "Bueno",
    "Luis Marcos Medarde Santiago": "Medarde",
    "Marcelo Alejandro Panelo Muñoz": "Panelo",
    "Roberto Carlos Sánchez Álvarez": "Sánchez",
    "Samid Eduardo Escalona Landi": "Escalona",
    "Carlos Alejandro Didenot Chirinos": "Didenot",
    "Manuel Asis Campos Rosas": "Campos",
    "Liliam Barbara Blanco Garcia": "Blanco",
    "Amy Ashley Cepero Lopez": "Cepero",
    "Karla July Fernandez Rivero": "Fernandez",
    "María Adela Perera Borrego": "Perera",
    # Hispanic 3-token: Given Paternal Maternal -> paternal
    "Argimiro Aponte Ramos": "Aponte",
    "Carlos González Lema": "González",
    "Federico García Lemos": "García",
    "Javier Jiménez Carrazoni": "Jiménez",
    "ALBERT CASTILLO DALMAU": "Castillo",
    "Alejandro García García": "García",
    "Alejandro González Vega": "González",
    "Alessandro Manzone Barranco": "Manzone",
    "Antonio Ruperez Benito": "Ruperez",
    "Daniel Sanz Wawer": "Sanz",
    "Dennys Orduñez Echarte": "Orduñez",
    "Fanny Duarte Napoles": "Duarte",
    "Michel Lopez Abreu": "Lopez",
    "Omar García Blanco": "García",
    "Sergio Trigo Urquijo": "Trigo",
    "Omar Almeida Quintana": "Almeida",
    "Yuri González Vidal": "González",
    "Alexis Murillo Tsijli": "Murillo",
    "Francisco Hernandez Basante": "Hernandez",
    "Ismael Alshameary Puente": "Alshameary",
    "Ivan Soriano Quispe": "Soriano",
    "Mariano Ortega Amarelle": "Ortega",
    "Martin Martinez Romero": "Martinez",
    "Miguel Medina Paz": "Medina",
    "Orlen Ruiz Sánchez": "Ruiz",
    "Sebastian Sanchez Lizcano": "Sanchez",
    "Yasel Borges Ferias": "Borges",
    "Seidy Pagés Román": "Pagés",
    "Yoana González Ochoa": "González",
    "Flavia Cancio-Bello Ayes": "Cancio-Bello",
    # 3-token where tokens 1-2 are both given names -> last token is the surname
    "Esteban Horacio Deichmann": "Deichmann",
    "Guillermo José Llanos": "Llanos",
    "Pablo Nicolas Barrionuevo": "Barrionuevo",
    "Simón Alejandro Languidey": "Languidey",
    "ALEJANDRO WALDO ZALAPA": "Zalapa",
    "Roberto Carlos Miramontes": "Miramontes",
    "Juan Cruz Arias": "Arias",
    "Adriana Kostadinova Nikolova": "Nikolova",
    "Silvia Raluca Sgircea": "Sgircea",
    "Ana Daniela Madrigal": "Madrigal",
    "Julio Catalino Sadorra": "Sadorra",
    "Dion james Moyo": "Moyo",
    "Vinod Kumar Sharma": "Sharma",
    "Arvinder Preet Singh": "Singh",
    "Jeth Romy Morado": "Morado",
    "Quang Thai Ngo": "Ngo",
    "Ram S Krishnan": "Krishnan",
    "Ras Malaku Lorne": "Lorne",
    "Anna M. Sargsyan": "Sargsyan",
    "Eric Jr. Labog": "Labog",
    "Huseyin Can Agdelen": "Agdelen",
    "Kim Steven Yap": "Yap",
    "Luís Henrique Coelho": "Coelho",
    "Mohammad Fahad Rahman": "Rahman",
    "Sebastian Lukas Kostolansky": "Kostolansky",
    "Ante Leon Starčević": "Starčević",
    "Oguz Kagan Guven": "Guven",
    "Vrushali Umesh Deodhar": "Deodhar",
    "Rutuja S Bakshi": "Bakshi",
    "Mahdi Gholami Orimi": "Gholami",
    "morteza mahjoob zardast": "Mahjoob",
    # compound surnames kept whole
    "Amro El Jawich": "El Jawich",
    "Edoardo Di Benedetto": "Di Benedetto",
    # full name is the only correct address form
    "TILAHUN ABEL MATHEWOS": None,
    "Trần Tuấn Minh": None,
    "Phúc Nguyễn Đặng Hồng": None,
    "Nguyen Thi Minh Oanh": None,
    "Sai Agni Jeevitesh J": None,
    "Leandro Formes de Arruda": None,
    "Vitor Firmo de Souza Rocha": None,
    "RAVI TEJA S": "Ravi Teja",
    "Srinath Rao SV": "Srinath Rao",
    # surname-first (Slavic / Armenian order as scraped)
    "Khamitskiy Sergei": "Khamitskiy",
    "Tasic Vladimir": "Tasic",
    "Putrenko Kirill": "Putrenko",
    "Badmatsyrenov Oleg": "Badmatsyrenov",
    "Antonyan Hamlet": "Antonyan",
    "Papp Bence": "Papp",
    # South Indian: trailing initials are not a surname, the given name is used
    "Divyalakshmi R": "Divyalakshmi",
    "Harshad S": "Harshad",
    "Muthaiah AL": "Muthaiah",
    "Nawin JJ": "Nawin",
    "Raghunandan KS": "Raghunandan",
    "Rathanvel VS": "Rathanvel",
    "Sarveshwaran V": "Sarveshwaran",
    "Vignesh NR": "Vignesh",
    "Visakh NR": "Visakh",
    "MB Muralidharan": "Muralidharan",
    # trailing punctuation artifact
    "Matías Ianovsky.": "Ianovsky",
    # given-name-only / ambiguous, address by full name
    "Michelle Catherina": None,
    "Nery Junior": None,
    "Máximo Iack": None,
}

# Lichess coach display names that are handles, not names. No salutation can be
# built from these, so they get the generic form. The two exceptions carry a
# full name inside the address itself and are resolved to a surname.
HANDLES = {"federerchi", "kstorn", "Philosopherr", "thecatdoglady",
           "UntilItIsOtherwise", "GeL Esteb"}
SURNAME_FROM_ADDRESS = {
    "lorenabeatrizmontejobello@gmail.com": "Montejo",   # chess_09L
    "nutakkipriyanka@gmail.com": "Nutakki",             # Querencia_19
}

WTITLES = {"WGM", "WIM", "WFM", "WCM"}

# Women who hold an open (non-W) title. The W-prefix rule cannot see them, and
# "Sir" to a woman is the one salutation error that actually offends.
WOMEN_OPEN_TITLE = {
    "Anita Gara", "Anna M. Sargsyan", "Iva Videnova-Kuljasevic",
    "Lela Javakhishvili", "Nisha Mohota", "Fanny Duarte Napoles",
    "Juliana Terao", "Lara Schulze", "Liwia Jarocka",
}
# Given names used for both men and women. No honorific rather than a guess.
NO_HONORIFIC = {"Snehal Bhosale"}
ORG_SALUTATION = {
    "mesadepartes@federacionperuanadeajedrez.org": "Dear Federación Peruana de Ajedrez team,",
}

def shout_fix(tok):
    """RAHUL -> Rahul, but leave McLean / Cancio-Bello / d'Costa alone."""
    if len(tok) > 1 and tok.isupper():
        return "-".join(p.capitalize() for p in tok.split("-"))
    return tok[:1].upper() + tok[1:] if tok[:1].islower() else tok

def is_latin(s):
    return all(("LATIN" in unicodedata.name(c, "")) or not c.isalpha() for c in s)

def salutation(name, title, email):
    if email in ORG_SALUTATION:
        return ORG_SALUTATION[email]
    if name.startswith("(unident") or name in HANDLES:
        return "Dear Coach,"
    hon = "Ma'am" if (title in WTITLES or name in WOMEN_OPEN_TITLE) else "Sir"
    if name in NO_HONORIFIC:
        hon = None
    if email in SURNAME_FROM_ADDRESS:
        addr = SURNAME_FROM_ADDRESS[email]
    elif name in SURNAME:
        addr = SURNAME[name] or name
    elif True:
        toks = name.split()
        if len(toks) == 2:
            addr = toks[-1]          # Firstname Lastname, latin or cyrillic/greek
        else:
            addr = name              # never guess; formal beats wrong
    addr = " ".join(shout_fix(t) for t in addr.split())
    prefix = f"{title} " if title and title.upper() != "UNKNOWN" else ""
    return f"Dear {prefix}{addr}," if hon is None else f"Dear {prefix}{addr} {hon},"

def testimonial_clause(title):
    t = (title or "").upper()
    if not t or t == "UNKNOWN":
        return "Testimonials from experienced coaches like you"
    return f"{t} testimonials like yours"

def render(sal, title):
    ttl = testimonial_clause(title)
    paras = [p.replace("{SAL}", sal).replace("{TTL}", ttl) for p in PARAS]
    body = "\n\n".join(paras[:-2]) + "\n\n" + paras[-2] + "\n" + paras[-1]
    html = "<br><br>".join(
        p.replace("chessmasti.com", '<a href="https://chessmasti.com">chessmasti.com</a>')
        if p.startswith("The site is") else p
        for p in paras[:-2]
    ) + "<br><br>" + paras[-2] + "<br>" + paras[-1]
    return body, html

# ------------------------------------------------------------------ selection
sent_addrs = set()
for f in SENT_LOGS:
    for line in open(f):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 3 and "@" in p[2]:
            sent_addrs.add(p[2].strip().lower())

rows = list(csv.DictReader(open(CONTACTS)))
addr2name = {}
for r in rows:
    e = (r["email"] or "").strip().lower()
    if e:
        addr2name.setdefault(e, r["name"].strip())
sent_people = {addr2name[a] for a in sent_addrs if a in addr2name}
assert len(sent_addrs) == 90, len(sent_addrs)
assert len(sent_people) == 90, len(sent_people)

seen_addr, seen_person = set(), set()
queue, dropped = [], {"sent_addr": 0, "sent_person": 0, "dup_addr": 0,
                      "dup_person": 0, "bad_addr": 0}
for r in rows:
    email = (r["email"] or "").strip()
    name = r["name"].strip()
    title = (r["title"] or "").strip()
    lo = email.lower()
    if not EMAIL_RE.match(email) or lo in MANGLED:
        dropped["bad_addr"] += 1;  continue
    if lo in sent_addrs:
        dropped["sent_addr"] += 1; continue
    if lo in seen_addr:
        dropped["dup_addr"] += 1;  continue
    # person-level: the unidentified FIDE-trainer rows are 12 DIFFERENT people
    # sharing one placeholder name, so they are keyed by address instead.
    key = lo if name.startswith("(unident") else name
    if key in sent_people:
        dropped["sent_person"] += 1; continue
    if key in seen_person:
        dropped["dup_person"] += 1;  continue
    seen_addr.add(lo); seen_person.add(key)
    sal = salutation(name, title, lo)
    body, html = render(sal, title)
    queue.append({"email": email, "name": name, "title": title or "unknown",
                  "sal": sal, "subject": SUBJECT, "body": body, "htmlBody": html})

for i, q in enumerate(queue, 1):
    q["i"] = i

with open(OUT, "w") as fh:
    for q in queue:
        fh.write(json.dumps(q, ensure_ascii=False) + "\n")

print(f"queue: {len(queue)}")
print("dropped:", dropped)
assert len({q['email'].lower() for q in queue}) == len(queue), "dup address"
assert not ({q['name'] for q in queue if not q['name'].startswith('(unident')}
            & sent_people), "already-emailed person in queue"
