"""BGB lineup allocator and battlefield-map renderer.

Ported, near-verbatim, from `pou-management/bgb/bgb_lineup.py`, which is where
this was written and where it is still run from a Mac. Two changes only:

  * no CLI, and no spreadsheet or CSV loading -- the roster comes from the
    database (see `cards.py`), so the file-reading half of the original is gone;
  * fonts are found on Linux as well as on a Mac. A Mac ships one pan-Unicode
    face and Debian ships Noto, one file per script, so a language may now name
    its own regular face and not just its own bold one.

Everything else -- the allocation, the geometry, the fifteen languages -- is the
original. Keep it that way: changes belong upstream first, then get copied here,
or the two drift and the cards stop matching the ones already handed out.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# 1. GAME CONSTANTS  (from GAME_RULES.md — sourced from the in-game help panel)
# ---------------------------------------------------------------------------

# Alliance points: per BUILDING.  Personal points: per PLAYER occupying it.
BUILDING_TYPES = {
    "factory": dict(
        label="RARE EARTH FACTORY",
        short="RARE EARTH FACTORY", short_ko="희토류 공장", short_ja="希土工場", short_zh="稀土工廠", short_zh_cn="稀土工厂", short_th="โรงงานธาตุหายาก", short_vi="XƯỞNG ĐẤT HIẾM", short_id="PABRIK TANAH LANGKA", short_tr="NADİR TOPRAK FABRİKASI", short_de="FABRIK DER SELTENEN ERDEN", short_it="FABBRICA DI METALLI RARI", short_fr="USINE DE TERRES RARES", short_es="FÁBRICA DE METALES RAROS", short_pt="FÁBRICA DE TERRAS RARAS", short_ar="مصنع العناصر النادرة",
        alliance_initial=0, alliance_rate=0,
        personal_initial=0, personal_rate=0,
        buff="Rare Earth Alloy Output: Time 1 15 min / Time 2 25 min",
        note="Carry Rare Earth Alloy to OUR BASE  ->  60-100K alliance / 100K personal",
    ),
    "military": dict(
        label="MILITARY BASE",
        short="MILITARY BASE", short_ko="군사 기지", short_ja="軍事基地", short_zh="軍事基地", short_zh_cn="军事基地", short_th="ฐานทหาร", short_vi="CĂN CỨ QUÂN SỰ", short_id="PANGKALAN MILITER", short_tr="ASKERİ ÜS", short_de="MILITÄRBASIS", short_it="BASE MILITARE", short_fr="BASE MILITAIRE", short_es="BASE MILITAR", short_pt="BASE MILITAR", short_ar="القاعدة العسكرية",
        alliance_initial=10_000, alliance_rate=3_000,
        personal_initial=5_000, personal_rate=960,
        buff="Damage dealt in combat +20%  (both = +40%)",
        note="",
    ),
    "hospital": dict(
        label="FIELD HOSPITAL",
        short="FIELD HOSPITAL", short_ko="의료 센터", short_ja="医療ステーション", short_zh="醫療站", short_zh_cn="医疗站", short_th="สถานีรักษา", short_vi="TRẠM XÁ", short_id="POS MEDIS", short_tr="SAĞLIK İSTASYONU", short_de="FELDLAZARETT", short_it="STAZIONE MEDICA", short_fr="POSTE MÉDICAL", short_es="ESTACIÓN MÉDICA", short_pt="POSTO MÉDICO", short_ar="محطة العلاج",
        alliance_initial=10_000, alliance_rate=3_000,
        personal_initial=5_000, personal_rate=960,
        buff="Healing speed +50%  (both = +100%)",
        note="",
    ),
    "refinery": dict(
        label="OIL REFINERY",
        short="OIL REFINERY", short_ko="정유 공장", short_ja="石油精製工場", short_zh="煉油廠", short_zh_cn="炼油厂", short_th="โรงกลั่นน้ำมัน", short_vi="XƯỞNG LỌC DẦU", short_id="PABRIK MINYAK", short_tr="PETROL RAFİNERİ", short_de="ÖLRAFFINERIE", short_it="RAFFINERIE PETROLIFERE", short_fr="RAFFINERIE", short_es="REFINERÍA DE PETRÓLEO", short_pt="REFINARIA", short_ar="مصفاة النفط",
        alliance_initial=4_000, alliance_rate=1_200,
        personal_initial=2_000, personal_rate=960,
        buff="no buff",
        note="",
    ),
    "tank": dict(
        label="OIL TANK",
        short="OIL TANK", short_ko="석유 탱크", short_ja="石油タンク", short_zh="油罐", short_zh_cn="油罐", short_th="ถังน้ำมัน", short_vi="THÙNG DẦU", short_id="TANGKI MINYAK", short_tr="PETROL TANKI", short_de="ÖLTANK", short_it="SERBATOI PETROLIFERI", short_fr="RÉSERVOIR D'HUILE", short_es="TANQUE DE PETRÓLEO", short_pt="TANQUE DE ÓLEO", short_ar="خزانات النفط",
        alliance_initial=0, alliance_rate=300,
        personal_initial=0, personal_rate=300,
        buff="Points earned via gathering",
        note="",
    ),
}

ALLOY_TIMES = (15, 25)          # minutes — confirmed by play
BATTLE_MINUTES = 50             # confirmed by play; not stated in-game

# Minute at which the Military Bases and Field Hospitals become contestable.
# The in-game help only says "after a certain period"; 10 min is confirmed by play.
CONTEST_UNLOCK_MIN = 10

# Minute from which a Substitute may take an absent Starter's seat.
SUB_ENTRY_MIN = 5

# ---------------------------------------------------------------------------
# 2. MAP LAYOUT
# ---------------------------------------------------------------------------
# Positions are NORMALISED (0..1) over the map panel, origin top-left.
# Confirmed composition: 2 Military Bases, 2 Field Hospitals, 6 Oil Refineries.
#
# >>> The COORDINATES below are a readable schematic, not a survey of the real
# >>> map — we have no map screenshot yet. Once someone grabs one, correct the
# >>> (x, y) pairs here and nothing else needs to change.

@dataclass
class Objective:
    key: str
    type: str
    x: float
    y: float
    label: str = ""


MAP_OBJECTIVES = [
    # The two alliance bases. Drawn as neutral home icons and deliberately NOT
    # labelled ours/enemy — which side is which isn't confirmed.
    Objective("BASE_NE",    "base",     0.88, 0.070),
    Objective("BASE_SW",    "base",     0.12, 0.900),

    # Top row: Military Base #1 aligned with Field Hospital #1.
    Objective("MB1",        "military", 0.12, 0.070),
    Objective("FH1",        "hospital", 0.50, 0.070),

    Objective("REF1",       "refinery", 0.32, 0.322),
    Objective("REF3",       "refinery", 0.68, 0.322),

    Objective("REF5",       "refinery", 0.12, 0.435),
    Objective("FACTORY",    "factory",  0.50, 0.450),
    Objective("REF6",       "refinery", 0.88, 0.435),

    Objective("REF4",       "refinery", 0.30, 0.665),
    Objective("REF2",       "refinery", 0.70, 0.665),

    # Bottom row: Military Base #2 aligned with Field Hospital #2.
    Objective("FH2",        "hospital", 0.50, 0.900),
    Objective("MB2",        "military", 0.88, 0.900),
]

OBJ_BY_KEY = {o.key: o for o in MAP_OBJECTIVES}

# ---------------------------------------------------------------------------
# 2b. LANGUAGE
# ---------------------------------------------------------------------------
# Korean glossary fixed by the alliance:
# Building/objective names use the OFFICIAL in-game Korean, verified against
# in-game_instructions/korean/ so players can match the map to their screen:
#   군사 기지 · 의료 센터 · 정유 공장 · 석유 탱크 · 희토류 공장 · 희토류 합금
#   우리 본진 · 블랙머니 전장 · 연맹/개인 포인트 · 최초 점령 / 지속 점령
#   점령 버프 · 적군 격퇴 · 건물 공격 / 건물 방어 / 야전 · 전투력
# Alliance call-names are kept where they are deliberate slang: 황금공 (the ball)
# and 황금공팀. Starter 선발 / Substitute 예비 come from the alliance glossary —
# the Korean Overview/Rules tabs are not captured yet, so they stay unverified.

LANG = "en"
RTL_LANGS = {"ar"}

# Each language's name for itself, taken from the game's own language list
# (IDs 390752-390783) looked up in that language's OWN table, so every entry is
# the game's wording rather than ours. zh uses ID 391083 ("Traditional
# Chinese"); the game ships no "Simplified Chinese" string, so zh_cn falls back
# to the plain endonym and the ZH / ZH-CN code above it carries the distinction.
LANG_NAMES = {
    "en": "English",       "ko": "한국어",          "ja": "日本語",
    "zh": "繁體中文",       "zh_cn": "中文",         "th": "ไทย",
    "vi": "Tiếng Việt",    "id": "Bahasa Indonesia", "tr": "Türkçe",
    "de": "Deutsch",       "it": "Italiano",        "fr": "Français",
    "es": "Español",       "pt": "Português",       "ar": "اللغة العربية",
}

# Terminology below is the game's OWN text, extracted from the APK's
# localisation table (BGB event = string IDs 478001-478948), one table per
# language. Keys listed in gen: title/cap_order/stat/base/on_capture/
# ball_sub/ev_subs are official; everything else is alliance doctrine and
# keeps its own wording. A language may omit any doctrine key - t() falls
# back to English per key.
STRINGS = {
    "en": {
        "title": ["BLACK GOLD", "BATTLEFIELD"],
        "assign": "MINI-TEAM ASSIGNMENTS",
        "cap_prio": "PRIORITY",
        "prio_top": "BUILDINGS  >  ALLOY  >  KILLS",
        "cap_order": "MILITARY BASE  >  FIELD HOSPITAL  >  OIL REFINERY",
        "stat": "{n}/20 Starter  ·  Participants' Total CP {cp}",
        "base": "OUR BASE",
        "on_capture": "{v} Initial Control",
        "ball_when": "ALLOY {a}:00 / {b}:00",
        "ball_sub": "100K Personal Points · 60-100K Alliance Points",
        "clock": "BATTLE CLOCK",
        "ev_start": "START",
        "ev_subs": "SUBS IN",
        "ev_open": "MB/FH OPEN",
        "ev_ball": "ALLOY {i}",
        "ev_end": "END",
        "l_ref": "Oil Refineries are open from the start — take yours immediately",
        "l_subs": "Substitutes may take an absent Starter's seat",
        "l_open": "Military Bases + Field Hospitals open — Teams 1-4 hit theirs at once",
        "l_ball": "FIRST ALLOY — send 4 only: carrier + 1 guard + 2 clearers. Escalate only if pushed.",
        "l_ball2": "Second Alloy is a DECOY — 2-3 players stall it, everyone else holds buildings.",
        "l_tail": "Half the battle's points land AFTER the last Alloy. Hold to the whistle.",
        "l_warn": "Leaving a building costs 1,200-3,000/min and an Alloy is worth only ~3-5 min of full map control. Do not all chase the Alloy.",
        "orders": "STANDING ORDERS",
        "rules": "RULES OF ENGAGEMENT",
        "r1": "Rotate, don't stack — if your building is safe, TP to one being pushed.",
        "r2": "Don't auto-match 5v5 — let them waste time where we can spare it.",
        "r3": "Not a whale? Never contest alone — call for help immediately.",
        "r4": "Oil Tanks: every spare car, anywhere. +300/min alliance AND personal.",
        "r5": "DO NOT CHASE KILLS. Buildings > Alloy > kills.",
        "mark_ball": "When Team Alloys calls in, join the Alloy (\"ball\") fights.",
        "mark_anch": "Military Base lead — NEVER leaves, the MB must be held",
        "per": "Personal points are PER PLAYER  ·  alliance points are PER BUILDING",
    },
    "ko": {
        "title": ["블랙머니", "전장"],
        "assign": "미니 팀 배치",
        "cap_prio": "우선순위",
        "prio_top": "거점  >  황금공  >  적군 격퇴",
        "cap_order": "군사 기지  >  의료 센터  >  정유 공장",
        "stat": "{n}/20 선발  ·  출전 멤버 총 전투력 {cp}",
        "base": "우리 본진",
        "on_capture": "{v} 최초 점령",
        "ball_when": "황금공 {a}:00 / {b}:00",
        "ball_sub": "100K 개인 포인트 · 60-100K 연맹 포인트",
        "clock": "전투 타이머",
        "ev_start": "시작",
        "ev_subs": "예비 투입",
        "ev_open": "거점 개방",
        "ev_ball": "황금공 {i}",
        "ev_end": "종료",
        "l_ref": "정유 공장은 시작부터 점령 가능 — 각자 맡은 곳을 즉시 확보",
        "l_subs": "예비가 미출석 선발의 자리를 대신할 수 있음",
        "l_open": "군사 기지 + 의료 센터 개방 — 1~4팀은 개방 즉시 점령",
        "l_ball": "첫 황금공 — 4명만 투입: 운반 1 + 호위 1 + 길뚫 2. 밀릴 때만 증원.",
        "l_ball2": "두 번째 황금공은 미끼 — 2~3명만 시간 끌기, 나머지는 거점 유지.",
        "l_tail": "전체 점수의 절반은 마지막 황금공 이후에 들어옴. 종료까지 유지할 것.",
        "l_warn": "거점 이탈은 분당 1,200~3,000 손실이고, 황금공 1개는 전체 점령 3~5분 가치일 뿐. 전원이 황금공을 쫓지 말 것.",
        "orders": "행동 지침",
        "rules": "교전 수칙",
        "r1": "고정 배치보다 순환 — 내 거점이 안전하면 밀리는 곳으로 TP.",
        "r2": "5대5로 맞받지 말 것 — 버려도 될 거점은 시간을 끌게 둘 것.",
        "r3": "고래가 아니면 혼자 거점 다투지 말 것 — 즉시 지원 요청.",
        "r4": "석유 탱크: 남는 부대는 어디든 채집. 연맹·개인 각 +300/분.",
        "r5": "적군 격퇴를 노리지 말 것. 거점 > 황금공 > 격퇴.",
        "mark_ball": "황금공팀이 호출하면 황금공 전투에 합류할 것.",
        "mark_anch": "군사 기지 담당 — 절대 이탈 금지, 군사 기지는 반드시 사수",
        "per": "개인 점수는 인원 단위  ·  연맹 점수는 거점 단위",
    },
    "ja": {
        "title": ["黒金戦場"],
        "assign": "ミニチーム配置",
        "cap_prio": "優先順位",
        "prio_top": "拠点  >  合金  >  撃破",
        "cap_order": "軍事基地  >  医療ステーション  >  石油精製工場",
        "stat": "{n}/20 先発  ·  参戦メンバー総戦力 {cp}",
        "base": "味方本拠地",
        "on_capture": "{v} 初回制圧",
        "ball_when": "合金 {a}:00 / {b}:00",
        "ball_sub": "100K 個人ポイント · 60-100K 同盟ポイント",
        "clock": "戦闘タイマー",
        "ev_start": "開始",
        "ev_subs": "控え投入",
        "ev_open": "拠点解放",
        "ev_ball": "合金 {i}",
        "ev_end": "終了",
        "l_ref": "石油精製工場は開始直後から占領可能 — 担当をすぐ確保",
        "l_subs": "控えが不在の先発の枠に入れる",
        "l_open": "軍事基地・医療ステーション解放 — 1〜4班は即占領",
        "l_ball": "第1合金 — 4人のみ:運搬+護衛1+先導2。押された時のみ増援。",
        "l_ball2": "第2合金は囮 — 2〜3人で時間稼ぎ、残りは拠点を維持。",
        "l_tail": "全得点の半分は最後の合金の後。終了まで維持すること。",
        "l_warn": "拠点を離れると毎分1,200〜3,000の損失。合金1個は完全支配3〜5分の価値。全員で合金を追わないこと。",
        "orders": "行動指針",
        "rules": "交戦規則",
        "r1": "固まらず巡回 — 自拠点が安全なら押されている所へTP。",
        "r2": "5対5で受けない — 捨てられる拠点なら時間を使わせる。",
        "r3": "課金勢でなければ単独で拠点を争わない — 即応援要請。",
        "r4": "石油タンク:余った部隊は全て採集へ。同盟・個人 各+300/分。",
        "r5": "撃破を狙わない。拠点 > 合金 > 撃破。",
        "mark_ball": "合金班の呼び出しがあれば合金戦に合流。",
        "mark_anch": "軍事基地担当 — 絶対に離れない、基地は必ず死守",
        "per": "個人ポイントは人数ごと · 同盟ポイントは拠点ごと",
    },
    "zh": {
        "title": ["黑金戰場"],
        "assign": "小隊配置",
        "cap_prio": "優先順序",
        "prio_top": "據點  >  合金  >  擊殺",
        "cap_order": "軍事基地  >  醫療站  >  煉油廠",
        "stat": "{n}/20 首發  ·  出戰成員總戰力 {cp}",
        "base": "我方大本營",
        "on_capture": "{v} 首次控制",
        "ball_when": "合金 {a}:00 / {b}:00",
        "ball_sub": "100K 個人積分 · 60-100K 聯盟積分",
        "clock": "戰鬥計時",
        "ev_start": "開始",
        "ev_subs": "替補進場",
        "ev_open": "據點開放",
        "ev_ball": "合金 {i}",
        "ev_end": "結束",
        "l_ref": "煉油廠一開始即可佔領 — 立刻拿下自己的目標",
        "l_subs": "替補可頂替未到場的先發",
        "l_open": "軍事基地 + 醫療站開放 — 1~4隊立即佔領",
        "l_ball": "第一顆合金 — 只派4人:運送+護衛1+開路2。被壓制才增援。",
        "l_ball2": "第二顆合金為誘餌 — 2~3人拖延，其餘留守據點。",
        "l_tail": "一半的分數在最後一顆合金之後。守到結束。",
        "l_warn": "離開據點每分鐘損失1,200~3,000，一顆合金只值完全控制3~5分鐘。不要全員去搶合金。",
        "orders": "行動守則",
        "rules": "交戰守則",
        "r1": "輪替勿堆疊 — 自己的據點安全就TP去支援被壓制的。",
        "r2": "不要5打5 — 可以放棄的據點就讓他們浪費時間。",
        "r3": "不是大戶就別單獨搶據點 — 立刻求援。",
        "r4": "油罐:多餘的部隊全部去採集。聯盟與個人各+300/分鐘。",
        "r5": "不要追擊殺。據點 > 合金 > 擊殺。",
        "mark_ball": "合金隊呼叫時，加入合金戰。",
        "mark_anch": "軍事基地負責人 — 絕不離開，基地必守",
        "per": "個人積分按人計算 · 聯盟積分按據點計算",
    },
    "zh_cn": {
        "title": ["黑金战场"],
        "assign": "小队配置",
        "cap_prio": "优先顺序",
        "prio_top": "据点  >  合金  >  击杀",
        "cap_order": "军事基地  >  医疗站  >  炼油厂",
        "stat": "{n}/20 首发  ·  出战成员总战力 {cp}",
        "base": "我方大本营",
        "on_capture": "{v} 首次控制",
        "ball_when": "合金 {a}:00 / {b}:00",
        "ball_sub": "100K 个人积分 · 60-100K 联盟积分",
        "clock": "战斗计时",
        "ev_start": "开始",
        "ev_subs": "替补进场",
        "ev_open": "据点开放",
        "ev_ball": "合金 {i}",
        "ev_end": "结束",
        "l_ref": "炼油厂从一开始就能占领 — 立刻拿下自己那座",
        "l_subs": "替补可以顶替缺席首发的位置",
        "l_open": "军事基地 + 医疗站开放 — 1~4队立即进攻",
        "l_ball": "第一次合金 — 只派4人：搬运1 + 护卫1 + 开路2。被压制时才增援。",
        "l_ball2": "第二次合金是诱饵 — 2~3人拖住，其余守据点。",
        "l_tail": "一半的分数在最后一次合金之后才到手。守到结束。",
        "l_warn": "离开据点每分钟损失1,200~3,000，一个合金只值3~5分钟的全图控制。不要全员去抢。",
        "orders": "行动守则",
        "rules": "交战守则",
        "r1": "轮换，不要堆叠 — 自己据点安全就传送去支援被压的据点。",
        "r2": "不要自动对上5v5 — 让他们在我们耗得起的地方浪费时间。",
        "r3": "不是大佬就别单独争夺 — 立刻请求支援。",
        "r4": "油罐：所有空闲部队，随处可采。联盟和个人各+300/分。",
        "r5": "不要追击杀。据点 > 合金 > 击杀。",
        "mark_ball": "合金队呼叫时，加入合金争夺战。",
        "mark_anch": "军事基地负责人 — 绝不离开，基地必守",
        "per": "个人积分按人计算  ·  联盟积分按据点计算",
    },
    "th": {
        "title": ["สนามรบแบล็คโกลด์"],
        "assign": "การจัดทีมย่อย",
        "cap_prio": "ลำดับความสำคัญ",
        "prio_top": "สิ่งก่อสร้าง  >  อัลลอย  >  สังหาร",
        "cap_order": "ฐานทหาร  >  สถานีรักษา  >  โรงกลั่นน้ำมัน",
        "stat": "{n}/20 ส่งครั้งแรก  ·  พลังรบรวมสมาชิกออกรบ {cp}",
        "base": "ค่ายฝ่ายเรา",
        "on_capture": "{v} ควบคุมครั้งแรก",
        "ball_when": "อัลลอย {a}:00 / {b}:00",
        "ball_sub": "100K แต้มส่วนตัว · 60-100K แต้มกิลด์",
        "clock": "นาฬิกาสนามรบ",
        "ev_start": "เริ่ม",
        "ev_subs": "ตัวสำรองเข้า",
        "ev_open": "เปิดฐาน/สถานี",
        "ev_ball": "อัลลอย {i}",
        "ev_end": "จบ",
        "l_ref": "โรงกลั่นน้ำมันเปิดตั้งแต่ต้น — ยึดของทีมตัวเองทันที",
        "l_subs": "ตัวสำรองเข้าแทนที่ตัวจริงที่ไม่มาได้",
        "l_open": "ฐานทหาร + สถานีรักษาเปิด — ทีม 1-4 เข้ายึดทันที",
        "l_ball": "อัลลอยแรก — ส่งแค่ 4 คน: คนขน + การ์ด 1 + เคลียร์ทาง 2 เพิ่มกำลังเมื่อโดนกดดันเท่านั้น",
        "l_ball2": "อัลลอยที่สองเป็นตัวล่อ — 2-3 คนถ่วงเวลา ที่เหลือรักษาสิ่งก่อสร้าง",
        "l_tail": "ครึ่งหนึ่งของแต้มมาหลังอัลลอยสุดท้าย รักษาไว้จนหมดเวลา",
        "l_warn": "การทิ้งสิ่งก่อสร้างเสีย 1,200-3,000/นาที และอัลลอยหนึ่งชิ้นมีค่าเพียง ~3-5 นาทีของการคุมแผนที่ อย่าไล่ตามกันทั้งหมด",
        "orders": "คำสั่งประจำ",
        "rules": "กฎการปะทะ",
        "r1": "หมุนเวียน อย่ากระจุก — ถ้าสิ่งก่อสร้างของคุณปลอดภัย ให้ TP ไปช่วยจุดที่โดนกด",
        "r2": "อย่ารับ 5v5 อัตโนมัติ — ปล่อยให้พวกเขาเสียเวลาในจุดที่เรายอมเสียได้",
        "r3": "ไม่ใช่ตัวท็อป? อย่าแย่งคนเดียว — ขอความช่วยเหลือทันที",
        "r4": "ถังน้ำมัน: ใช้รถว่างทุกคัน ทุกที่ +300/นาที ทั้งพันธมิตรและส่วนตัว",
        "r5": "อย่าไล่ล่าสังหาร สิ่งก่อสร้าง > อัลลอย > สังหาร",
        "mark_ball": "เมื่อทีมอัลลอยเรียก ให้เข้าร่วมการแย่งอัลลอย",
        "mark_anch": "หัวหน้าฐานทหาร — ห้ามออกเด็ดขาด ต้องรักษาฐานไว้",
        "per": "แต้มส่วนตัวคิดต่อคน  ·  แต้มพันธมิตรคิดต่อสิ่งก่อสร้าง",
    },
    "vi": {
        "title": ["CHIẾN TRƯỜNG", "HẮC KIM"],
        "assign": "PHÂN CÔNG ĐỘI NHỎ",
        "cap_prio": "ƯU TIÊN",
        "prio_top": "CÔNG TRÌNH  >  HỢP KIM  >  TIÊU DIỆT",
        "cap_order": "CĂN CỨ QUÂN SỰ  >  TRẠM XÁ  >  XƯỞNG LỌC DẦU",
        "stat": "{n}/20 Chính  ·  Tổng Lực Chiến thành viên ra trận {cp}",
        "base": "CĂN CỨ CHÍNH PHE TA",
        "on_capture": "{v} Kiểm Soát Lần Đầu",
        "ball_when": "HỢP KIM {a}:00 / {b}:00",
        "ball_sub": "100K Điểm Cá Nhân · 60-100K Điểm Liên Minh",
        "clock": "ĐỒNG HỒ TRẬN",
        "ev_start": "BẮT ĐẦU",
        "ev_subs": "DỰ BỊ VÀO",
        "ev_open": "MỞ CCQS/TX",
        "ev_ball": "HỢP KIM {i}",
        "ev_end": "KẾT THÚC",
        "l_ref": "Xưởng Lọc Dầu mở từ đầu — chiếm ngay của đội mình",
        "l_subs": "Dự bị có thể thế chỗ người Chính vắng mặt",
        "l_open": "Căn Cứ Quân Sự + Trạm Xá mở — Đội 1-4 đánh ngay",
        "l_ball": "HỢP KIM ĐẦU — chỉ cử 4: người mang + 1 hộ vệ + 2 dọn đường. Chỉ tăng viện khi bị ép.",
        "l_ball2": "Hợp Kim thứ hai là MỒI NHỬ — 2-3 người cầm chân, còn lại giữ công trình.",
        "l_tail": "Nửa số điểm đến SAU Hợp Kim cuối. Giữ đến hết giờ.",
        "l_warn": "Rời công trình mất 1.200-3.000/phút, một Hợp Kim chỉ đáng ~3-5 phút kiểm soát toàn bản đồ. Đừng cả đội đuổi theo.",
        "orders": "MỆNH LỆNH THƯỜNG TRỰC",
        "rules": "QUY TẮC GIAO CHIẾN",
        "r1": "Luân phiên, đừng dồn — công trình của bạn an toàn thì TP tới nơi đang bị ép.",
        "r2": "Đừng tự động đấu 5v5 — để chúng mất thời gian ở nơi ta chấp nhận được.",
        "r3": "Không phải cá voi? Đừng tranh một mình — gọi hỗ trợ ngay.",
        "r4": "Thùng Dầu: mọi xe rảnh, ở đâu cũng được. +300/phút cho liên minh VÀ cá nhân.",
        "r5": "ĐỪNG ĐUỔI THEO MẠNG. Công trình > Hợp Kim > tiêu diệt.",
        "mark_ball": "Khi Team Alloys gọi, tham gia đánh Hợp Kim.",
        "mark_anch": "Trưởng Căn Cứ Quân Sự — KHÔNG BAO GIỜ rời, phải giữ CCQS",
        "per": "Điểm cá nhân THEO NGƯỜI  ·  điểm liên minh THEO CÔNG TRÌNH",
    },
    "id": {
        "title": ["MEDAN", "EMAS HITAM"],
        "assign": "TUGAS TIM MINI",
        "cap_prio": "PRIORITAS",
        "prio_top": "BANGUNAN  >  PADUAN  >  KILL",
        "cap_order": "PANGKALAN MILITER  >  POS MEDIS  >  PABRIK MINYAK",
        "stat": "{n}/20 Utama  ·  Total CP anggota yang bertempur {cp}",
        "base": "MARKAS SENDIRI",
        "on_capture": "{v} Penguasaan Pertama",
        "ball_when": "PADUAN {a}:00 / {b}:00",
        "ball_sub": "100K Poin Pribadi · 60-100K Poin Aliansi",
        "clock": "JAM PERTEMPURAN",
        "ev_start": "MULAI",
        "ev_subs": "CADANGAN",
        "ev_open": "PANGKALAN",
        "ev_ball": "PADUAN {i}",
        "ev_end": "SELESAI",
        "l_ref": "Pabrik Minyak terbuka sejak awal — segera ambil bagian kalian",
        "l_subs": "Cadangan boleh mengisi kursi pemain inti yang tidak hadir",
        "l_open": "Pangkalan Militer + Pos Medis terbuka — Tim 1-4 langsung rebut",
        "l_ball": "PADUAN PERTAMA — kirim 4 saja: pembawa + 1 pengawal + 2 pembuka jalan.",
        "l_ball2": "Paduan kedua UMPAN — 2-3 orang mengulur, sisanya tetap di bangunan.",
        "l_tail": "Separuh poin masuk SETELAH paduan terakhir. Tahan sampai peluit.",
        "l_warn": "Meninggalkan bangunan merugikan 1.200-3.000/menit, dan satu paduan hanya senilai ~3-5 menit kendali penuh. Jangan semua mengejar paduan.",
        "orders": "PERINTAH TETAP",
        "rules": "ATURAN PERTEMPURAN",
        "r1": "Berputar, jangan menumpuk — bila bangunanmu aman, TP ke yang terdesak.",
        "r2": "Jangan balas 5 lawan 5 — biarkan mereka buang waktu di sana.",
        "r3": "Bukan whale? Jangan rebut bangunan sendirian — segera minta bantuan.",
        "r4": "Tangki Minyak: kirim semua mobil sisa. Aliansi DAN pribadi +300/menit.",
        "r5": "JANGAN KEJAR KILL. Bangunan > paduan > kill.",
        "mark_ball": "Saat Tim Paduan memanggil, ikut pertempuran paduan.",
        "mark_anch": "Pemimpin Pangkalan — TIDAK PERNAH pergi, pangkalan wajib ditahan",
        "per": "Poin pribadi PER PEMAIN  ·  poin aliansi PER BANGUNAN",
    },
    "tr": {
        "title": ["KARA ALTIN", "SAVAŞ ALANI"],
        "assign": "MİNİ TAKIM GÖREVLERİ",
        "cap_prio": "ÖNCELİK",
        "prio_top": "BİNALAR  >  ALAŞIM  >  ÖLDÜRME",
        "cap_order": "ASKERİ ÜS  >  SAĞLIK İSTASYONU  >  PETROL RAFİNERİ",
        "stat": "{n}/20 Başlangıç  ·  Katılımcıların Toplam CP {cp}",
        "base": "ANA KAMPIMIZ",
        "on_capture": "{v} İlk Kontrol",
        "ball_when": "ALAŞIM {a}:00 / {b}:00",
        "ball_sub": "100K Bireysel Puanlar · 60-100K İttifak Puanları",
        "clock": "SAVAŞ SAATİ",
        "ev_start": "BAŞLANGIÇ",
        "ev_subs": "YEDEK",
        "ev_open": "ÜS/SAĞLIK",
        "ev_ball": "ALAŞIM {i}",
        "ev_end": "BİTİŞ",
        "l_ref": "Petrol Rafinerileri baştan açık — kendi rafinerinizi hemen alın",
        "l_subs": "Yedekler, gelmeyen bir asıl oyuncunun yerini alabilir",
        "l_open": "Askeri Üs + Sağlık İstasyonu açılır — Takım 1-4 hemen ele geçirsin",
        "l_ball": "İLK ALAŞIM — sadece 4 kişi: taşıyıcı + 1 koruma + 2 yol açıcı. Zorlanınca takviye.",
        "l_ball2": "İkinci alaşım TUZAK — 2-3 kişi oyalasın, kalan herkes binalarda kalsın.",
        "l_tail": "Puanların yarısı son alaşımdan SONRA gelir. Sona kadar tutun.",
        "l_warn": "Bir binadan ayrılmak dakikada 1.200-3.000 kaybettirir; bir alaşım tam kontrolün sadece ~3-5 dakikası eder. Hep birlikte alaşımın peşine düşmeyin.",
        "orders": "DAİMİ EMİRLER",
        "rules": "ANGAJMAN KURALLARI",
        "r1": "Yığılmayın, dönüşümlü olun — binanız güvendeyse zorlanan yere TP atın.",
        "r2": "5'e 5 karşılık vermeyin — feda edebileceğimiz binada vakit kaybetsinler.",
        "r3": "Balina değilsen tek başına bina kapmaya kalkma — hemen yardım iste.",
        "r4": "Petrol Tankı: boştaki her araç toplasın. İttifak VE bireysel +300/dk.",
        "r5": "ÖLDÜRME PEŞİNDE KOŞMAYIN. Binalar > alaşım > öldürme.",
        "mark_ball": "Alaşım Takımı çağırdığında alaşım savaşına katıl.",
        "mark_anch": "Askeri Üs lideri — ASLA ayrılmaz, üs mutlaka tutulur",
        "per": "Bireysel puanlar KİŞİ BAŞINA  ·  ittifak puanları BİNA BAŞINA",
    },
    "de": {
        "title": ["SCHWARZGOLD", "SCHLACHTFELD"],
        "assign": "MINI-TEAM ZUTEILUNG",
        "cap_prio": "PRIORITÄT",
        "prio_top": "GEBÄUDE  >  LEGIERUNG  >  KILLS",
        "cap_order": "MILITÄRBASIS  >  FELDLAZARETT  >  ÖLRAFFINERIE",
        "stat": "{n}/20 Startspieler  ·  Gesamte Kampfkraft der Teilnehmer des Kampfes {cp}",
        "base": "UNSER HAUPTQUARTIER",
        "on_capture": "{v} Erste Kontrolle",
        "ball_when": "LEGIERUNG {a}:00 / {b}:00",
        "ball_sub": "100K Persönliche Punkte · 60-100K Allianz-Punkte",
        "clock": "KAMPFUHR",
        "ev_start": "START",
        "ev_subs": "ERSATZ",
        "ev_open": "MB/FL AUF",
        "ev_ball": "LEGIERUNG {i}",
        "ev_end": "ENDE",
        "l_ref": "Ölraffinerien sind ab Start offen — nimm deine sofort",
        "l_subs": "Ersatz darf den Platz eines fehlenden Startspielers übernehmen",
        "l_open": "Militärbasen + Feldlazarette offen — Teams 1-4 sofort drauf",
        "l_ball": "ERSTE LEGIERUNG — nur 4 schicken: Träger + 1 Wache + 2 Räumer. Nur bei Druck aufstocken.",
        "l_ball2": "Zweite Legierung ist ein KÖDER — 2-3 halten sie auf, Rest hält Gebäude.",
        "l_tail": "Die Hälfte der Punkte fällt NACH der letzten Legierung. Bis zum Schluss halten.",
        "l_warn": "Ein Gebäude zu verlassen kostet 1.200-3.000/Min, eine Legierung ist nur ~3-5 Min volle Kartenkontrolle wert. Nicht alle nachjagen.",
        "orders": "STEHENDE BEFEHLE",
        "rules": "EINSATZREGELN",
        "r1": "Rotieren, nicht stapeln — ist dein Gebäude sicher, TP zu einem unter Druck.",
        "r2": "Kein automatisches 5v5 — lass sie Zeit verlieren, wo wir es verkraften.",
        "r3": "Kein Wal? Nie allein angreifen — sofort Hilfe rufen.",
        "r4": "Öltanks: jedes freie Fahrzeug, überall. +300/Min Allianz UND persönlich.",
        "r5": "JAGT KEINE KILLS. Gebäude > Legierung > Kills.",
        "mark_ball": "Wenn Team Alloys ruft, in die Legierungskämpfe einsteigen.",
        "mark_anch": "Militärbasis-Anker — verlässt NIE, die MB muss gehalten werden",
        "per": "Persönliche Punkte PRO SPIELER  ·  Allianzpunkte PRO GEBÄUDE",
    },
    "it": {
        "title": ["BATTAGLIA PER", "L'ORO NERO"],
        "assign": "ASSEGNAZIONI MINI-SQUADRA",
        "cap_prio": "PRIORITÀ",
        "prio_top": "EDIFICI  >  LEGA  >  UCCISIONI",
        "cap_order": "BASE MILITARE  >  STAZIONE MEDICA  >  RAFFINERIE PETROLIFERE",
        "stat": "{n}/20 Titolari  ·  POC Totali dei Partecipanti {cp}",
        "base": "IL NOSTRO QG",
        "on_capture": "{v} Controllo Iniziale",
        "ball_when": "LEGA {a}:00 / {b}:00",
        "ball_sub": "100K Punti Individuali · 60-100K Punti Alleanza",
        "clock": "OROLOGIO DI BATTAGLIA",
        "ev_start": "INIZIO",
        "ev_subs": "RISERVE",
        "ev_open": "BM/SM APERTI",
        "ev_ball": "LEGA {i}",
        "ev_end": "FINE",
        "l_ref": "Le Raffinerie sono aperte dall'inizio — prendi subito la tua",
        "l_subs": "Le riserve possono prendere il posto di un titolare assente",
        "l_open": "Basi militari + Stazioni mediche aperte — le squadre 1-4 attaccano subito",
        "l_ball": "PRIMA LEGA — mandane solo 4: portatore + 1 guardia + 2 pulitori. Rinforza solo se sotto pressione.",
        "l_ball2": "La seconda Lega è un'ESCA — 2-3 la rallentano, gli altri tengono gli edifici.",
        "l_tail": "Metà dei punti arriva DOPO l'ultima Lega. Tenere fino al fischio.",
        "l_warn": "Lasciare un edificio costa 1.200-3.000/min e una Lega vale solo ~3-5 min di controllo totale. Non inseguitela tutti.",
        "orders": "ORDINI PERMANENTI",
        "rules": "REGOLE D'INGAGGIO",
        "r1": "Ruotare, non ammassarsi — se il tuo edificio è sicuro, TP su uno sotto attacco.",
        "r2": "Niente 5v5 automatico — falli perdere tempo dove possiamo permettercelo.",
        "r3": "Non sei una balena? Mai contendere da solo — chiedi aiuto subito.",
        "r4": "Serbatoi: ogni veicolo libero, ovunque. +300/min alleanza E personale.",
        "r5": "NON INSEGUIRE LE UCCISIONI. Edifici > Lega > uccisioni.",
        "mark_ball": "Quando Team Alloys chiama, unisciti agli scontri per la Lega.",
        "mark_anch": "Leader della Base militare — non se ne va MAI, la BM va tenuta",
        "per": "Punti personali PER GIOCATORE  ·  punti alleanza PER EDIFICIO",
    },
    "fr": {
        "title": ["LE CHAMP DE BATAILLE", "DE L'OR NOIR"],
        "assign": "AFFECTATIONS",
        "cap_prio": "PRIORITÉ",
        "prio_top": "BÂTIMENTS  >  ALLIAGE  >  KILLS",
        "cap_order": "BASE MILITAIRE  >  POSTE MÉDICAL  >  RAFFINERIE",
        "stat": "{n}/20 Premiers partants  ·  Effectif total des membres au combat {cp}",
        "base": "NOTRE CAMP DE BASE",
        "on_capture": "{v} La première fois que vous prenez le contrôle",
        "ball_when": "ALLIAGE {a}:00 / {b}:00",
        "ball_sub": "100K Score personnel · 60-100K Points d'alliance",
        "clock": "CHRONO DE BATAILLE",
        "ev_start": "DÉBUT",
        "ev_subs": "REMPLAC.",
        "ev_open": "BASE/POSTE",
        "ev_ball": "ALLIAGE {i}",
        "ev_end": "FIN",
        "l_ref": "Les raffineries sont ouvertes dès le début — prenez la vôtre tout de suite",
        "l_subs": "Un remplaçant peut prendre la place d'un titulaire absent",
        "l_open": "Bases militaires + postes médicaux ouverts — équipes 1-4 foncent",
        "l_ball": "1er ALLIAGE — 4 joueurs : porteur + 1 garde + 2 éclaireurs.",
        "l_ball2": "Le 2e alliage est un LEURRE — 2-3 le retardent, les autres tiennent.",
        "l_tail": "La moitié des points tombe APRÈS le dernier alliage. Tenez jusqu'au bout.",
        "l_warn": "Quitter un bâtiment coûte 1 200-3 000/min et un alliage ne vaut que ~3-5 min de contrôle total. Ne courez pas tous après l'alliage.",
        "orders": "CONSIGNES",
        "rules": "RÈGLES D'ENGAGEMENT",
        "r1": "Tournez, ne vous empilez pas — bâtiment sûr, TP vers celui qui souffre.",
        "r2": "Ne répondez pas 5 contre 5 — laissez-les perdre du temps.",
        "r3": "Pas une baleine ? Ne prenez jamais un bâtiment seul — demandez de l'aide.",
        "r4": "Réservoirs : envoyez chaque véhicule libre. +300/min alliance ET perso.",
        "r5": "NE COUREZ PAS APRÈS LES KILLS. Bâtiments > alliage > kills.",
        "mark_ball": "Quand l'équipe Alliage appelle, rejoignez le combat.",
        "mark_anch": "Chef de base militaire — ne part JAMAIS, la base doit tenir",
        "per": "Points perso PAR JOUEUR  ·  points d'alliance PAR BÂTIMENT",
    },
    "es": {
        "title": ["CAMPO DE", "ORO NEGRO"],
        "assign": "ASIGNACIONES",
        "cap_prio": "PRIORIDAD",
        "prio_top": "EDIFICIOS  >  ALEACIÓN  >  BAJAS",
        "cap_order": "BASE MILITAR  >  ESTACIÓN MÉDICA  >  REFINERÍA DE PETRÓLEO",
        "stat": "{n}/20 Primera publicación  ·  Poder total de los miembros en combate {cp}",
        "base": "NUESTRA BASE CENTRAL",
        "on_capture": "{v} Primera toma de control",
        "ball_when": "ALEACIÓN {a}:00 / {b}:00",
        "ball_sub": "100K Puntaje individual · 60-100K Puntos de la alianza",
        "clock": "RELOJ DE BATALLA",
        "ev_start": "INICIO",
        "ev_subs": "SUPLENT.",
        "ev_open": "BASE/MÉD.",
        "ev_ball": "ALEAC. {i}",
        "ev_end": "FIN",
        "l_ref": "Las refinerías están abiertas desde el inicio — toma la tuya ya",
        "l_subs": "Un suplente puede ocupar el puesto de un titular ausente",
        "l_open": "Bases militares + estaciones médicas abiertas — equipos 1-4 al ataque",
        "l_ball": "1ª ALEACIÓN — solo 4: portador + 1 guardia + 2 despejadores.",
        "l_ball2": "La 2ª aleación es SEÑUELO — 2-3 la demoran, el resto aguanta.",
        "l_tail": "La mitad de los puntos llega TRAS la última aleación. Aguantad al final.",
        "l_warn": "Dejar un edificio cuesta 1.200-3.000/min y una aleación solo vale ~3-5 min de control total. No vayáis todos a por la aleación.",
        "orders": "ÓRDENES PERMANENTES",
        "rules": "REGLAS DE COMBATE",
        "r1": "Rotad, no os amontonéis — si tu edificio está seguro, TP al que sufre.",
        "r2": "No respondáis 5 contra 5 — dejad que pierdan el tiempo.",
        "r3": "¿No eres ballena? Nunca disputes un edificio solo — pide ayuda ya.",
        "r4": "Tanques: enviad cada vehículo libre. +300/min alianza E individual.",
        "r5": "NO PERSIGÁIS BAJAS. Edificios > aleación > bajas.",
        "mark_ball": "Cuando el equipo Aleación llame, únete al combate.",
        "mark_anch": "Líder de base militar — NUNCA se va, la base debe aguantar",
        "per": "Puntos individuales POR JUGADOR  ·  puntos de alianza POR EDIFICIO",
    },
    "pt": {
        "title": ["CAMPO DE BATALHA", "DO OURO NEGRO"],
        "assign": "ATRIBUIÇÕES",
        "cap_prio": "PRIORIDADE",
        "prio_top": "EDIFÍCIOS  >  LIGA  >  ABATES",
        "cap_order": "BASE MILITAR  >  POSTO MÉDICO  >  REFINARIA",
        "stat": "{n}/20 Lançamento  ·  Poder total dos combatentes {cp}",
        "base": "NOSSA BASE",
        "on_capture": "{v} 1º controle",
        "ball_when": "LIGA {a}:00 / {b}:00",
        "ball_sub": "100K Pontos individuais · 60-100K Pontos aliança",
        "clock": "RELÓGIO DA BATALHA",
        "ev_start": "INÍCIO",
        "ev_subs": "RESERVAS",
        "ev_open": "BASE/POSTO",
        "ev_ball": "LIGA {i}",
        "ev_end": "FIM",
        "l_ref": "As refinarias abrem desde o início — tome a sua imediatamente",
        "l_subs": "Uma reserva pode ocupar a vaga de um titular ausente",
        "l_open": "Bases militares + postos médicos abertos — equipas 1-4 tomam já",
        "l_ball": "1ª LIGA — apenas 4: portador + 1 guarda + 2 abridores.",
        "l_ball2": "A 2ª liga é ISCA — 2-3 atrasam, os restantes seguram os edifícios.",
        "l_tail": "Metade dos pontos chega DEPOIS da última liga. Segurem até ao fim.",
        "l_warn": "Sair de um edifício custa 1.200-3.000/min e uma liga vale só ~3-5 min de controlo total. Não corram todos atrás da liga.",
        "orders": "ORDENS PERMANENTES",
        "rules": "REGRAS DE COMBATE",
        "r1": "Rodem, não se amontoem — edifício seguro, TP para o que sofre.",
        "r2": "Não respondam 5 contra 5 — deixem-nos perder tempo.",
        "r3": "Não és baleia? Nunca disputes um edifício sozinho — pede ajuda já.",
        "r4": "Tanques: enviem cada veículo livre. +300/min aliança E individual.",
        "r5": "NÃO PERSIGAM ABATES. Edifícios > liga > abates.",
        "mark_ball": "Quando a equipa Liga chamar, entra no combate.",
        "mark_anch": "Líder da base militar — NUNCA sai, a base tem de aguentar",
        "per": "Pontos individuais POR JOGADOR  ·  pontos de aliança POR EDIFÍCIO",
    },
    "ar": {
        "title": ["ساحة الذهب", "الأسود"],
        "assign": "توزيع الفرق",
        "cap_prio": "الأولوية",
        "prio_top": "المباني  >  السبائك  >  القتل",
        "cap_order": "القاعدة العسكرية  >  محطة العلاج  >  مصفاة النفط",
        "stat": "{n}/20 البداية  ·  إجمالي قوة الأعضاء المشاركين {cp}",
        "base": "قاعدتنا",
        "on_capture": "{v} السيطرة الأولية",
        "ball_when": "السبائك {a}:00 / {b}:00",
        "ball_sub": "⁨100K النقاط الشخصية⁩ · ⁨60-100K نقاط التحالف⁩",
        "clock": "مؤقت المعركة",
        "ev_start": "البداية",
        "ev_subs": "الاحتياط",
        "ev_open": "فتح المواقع",
        "ev_ball": "سبيكة {i}",
        "ev_end": "النهاية",
        "l_ref": "مصافي النفط متاحة من البداية — استولِ على مصفاتك فوراً",
        "l_subs": "يمكن للاحتياطي أخذ مكان أساسي غائب",
        "l_open": "فتح القواعد العسكرية ومحطات العلاج — الفرق 1-4 تستولي فوراً",
        "l_ball": "السبيكة الأولى — 4 فقط: ناقل + حارس + مُمهّدان للطريق.",
        "l_ball2": "السبيكة الثانية خدعة — 2-3 يعطّلون، والباقي يحافظ على المباني.",
        "l_tail": "نصف النقاط تأتي بعد السبيكة الأخيرة. حافظوا حتى النهاية.",
        "l_warn": "ترك المبنى يكلّف 1,200-3,000 في الدقيقة، والسبيكة تساوي 3-5 دقائق سيطرة كاملة فقط. لا تلاحقوا السبيكة جميعاً.",
        "orders": "الأوامر الدائمة",
        "rules": "قواعد الاشتباك",
        "r1": "تناوبوا ولا تتكدسوا — إن كان مبناك آمناً فانتقل لمن يتعرض للضغط.",
        "r2": "لا تردّوا 5 مقابل 5 — دعوهم يضيّعون الوقت على مبنى يمكن التخلي عنه.",
        "r3": "لست لاعباً قوياً؟ لا تنازع على مبنى وحدك — اطلب الدعم فوراً.",
        "r4": "خزانات النفط: أرسل كل مركبة فائضة للجمع. +300/دقيقة للتحالف والشخصي.",
        "r5": "لا تلاحقوا القتل. المباني > السبائك > القتل.",
        "mark_ball": "عند نداء فريق السبائك، انضم إلى معركة السبيكة.",
        "mark_anch": "قائد القاعدة العسكرية — لا يغادر أبداً، القاعدة يجب أن تصمد",
        "per": "النقاط الشخصية لكل لاعب  ·  نقاط التحالف لكل مبنى",
    },
}


def t(key: str, **kw) -> str:
    s = STRINGS.get(LANG, STRINGS["en"]).get(key, STRINGS["en"].get(key, key))
    return s.format(**kw) if kw else s


def bidi_num(text: str) -> str:
    """In RTL languages a bare '#1' is bidi-neutral and flips to '1#'. Wrap
    numeric tokens in LEFT-TO-RIGHT MARKs so they keep their written order."""
    if LANG not in RTL_LANGS:
        return text
    return re.sub(r"(#?\d[\d,\.]*)", "\u200e\\1\u200e", text)


def short_of(otype: str) -> str:
    m = BUILDING_TYPES[otype]
    return m.get(f"short_{LANG}") or m["short"]


def set_lang(lang: str) -> None:
    """Switch language. Korean needs a CJK-capable bold face, because Arial
    Bold has no Hangul glyphs and would render every heading as tofu boxes."""
    global LANG
    LANG = lang if lang in STRINGS else "en"
    set_bold_override(BOLD_BY_LANG.get(LANG))
    set_regular_override(REGULAR_BY_LANG.get(LANG))


# ---------------------------------------------------------------------------
# 3. MINI-TEAMS  (BATTLE_PLAN.md §1)
# ---------------------------------------------------------------------------

@dataclass
class Cell:
    name: str
    objectives: list          # objective keys, highest-value first
    seats: int
    color: tuple
    brief: str
    key: str = ""             # language-independent id, used by the draft tiers
    players: list = field(default_factory=list)

    @property
    def cp(self) -> int:
        return sum(p.cp for p in self.players)


# Cell definitions. `key` is the stable id used by the draft tiers; `name` and
# `brief` are keyed by language so adding a language is a data-only change.
CELL_DEFS = [
    ("ALLOYS", ["FACTORY"], 2, (242, 177, 56),
     {"en": "TEAM ALLOYS", "ko": "황금공팀", "ja": "合金班", "zh": "合金隊", "zh_cn": "合金队", "th": "ทีมอัลลอย", "vi": "ĐỘI HỢP KIM", "id": "TIM PADUAN", "tr": "ALAŞIM TAKIMI", "de": "TEAM LEGIERUNG", "it": "SQUADRA LEGA", "fr": "ÉQUIPE ALLIAGE", "es": "EQUIPO ALEACIÓN", "pt": "EQUIPA LIGA", "ar": "فريق السبائك"},
     {"en": "Roam free until 15:00 — reinforce anywhere. Then Alloy carrier + escort.",
      "ko": "15:00까지 자유 이동하며 어디든 지원. 이후 황금공 운반과 호위.",
      "ja": "15:00まで自由に移動して支援。以降は合金の運搬と護衛。",
      "zh": "15:00前自由支援各處。之後負責運送與護衛合金。",
      "zh_cn": "15:00前自由支援各处。之后负责运送与护卫合金。",
      "th": "อิสระจนถึง 15:00 — เสริมได้ทุกที่ จากนั้นขนอัลลอย + คุ้มกัน",
      "vi": "Tự do đến 15:00 — tiếp viện mọi nơi. Sau đó mang Hợp Kim + hộ tống.",
      "id": "Bebas berkeliling sampai 15:00. Lalu bawa + kawal paduan.",
      "tr": "15:00'e kadar serbest takviye. Sonra alaşımı taşı + koru.",
      "de": "Bis 15:00 frei verstärken. Danach Legierungsträger + Eskorte.",
      "it": "Liberi fino alle 15:00 — rinforzi ovunque. Poi portatore Lega + scorta.",
      "fr": "Libre jusqu'à 15:00 — renfort partout. Puis porteur + escorte.",
      "es": "Libre hasta las 15:00. Luego porta la aleación + escolta.",
      "pt": "Livre até às 15:00 — reforça onde for preciso. Depois porta + escolta.",
      "ar": "تحرك بحرية حتى 15:00 — ادعم أي مكان. ثم انقل السبيكة واحرسها."}),
    ("T1", ["MB1", "REF1"], 3, (224, 82, 82),
     {"en": "TEAM 1", "ko": "1팀", "ja": "1班", "zh": "1隊", "zh_cn": "1队", "th": "ทีม 1", "vi": "ĐỘI 1", "id": "TIM 1", "tr": "TAKIM 1", "de": "TEAM 1", "it": "SQUADRA 1", "fr": "ÉQUIPE 1", "es": "EQUIPO 1", "pt": "EQUIPA 1", "ar": "فريق 1"},
     {"en": "Military Base #1 → Oil Refinery #1. Keep 1 strong player on the MB.",
      "ko": "군사 기지 #1 → 정유 공장 #1. 군사 기지에 항상 강자 1명 유지.",
      "ja": "軍事基地#1 → 精製工場#1。基地に常に強者1人。",
      "zh": "軍事基地#1 → 煉油廠#1。基地永遠留1名強者。",
      "zh_cn": "军事基地 #1 → 炼油厂 #1。基地上始终留1名强者。",
      "th": "ฐานทหาร #1 → โรงกลั่นน้ำมัน #1 เก็บคนแข็ง 1 คนไว้ที่ฐานเสมอ",
      "vi": "Căn Cứ Quân Sự #1 → Xưởng Lọc Dầu #1. Giữ 1 người mạnh ở CCQS.",
      "id": "Pangkalan #1 → Pabrik Minyak #1. Selalu 1 pemain kuat di pangkalan.",
      "tr": "Askeri Üs #1 → Rafineri #1. Üste daima 1 güçlü oyuncu kalsın.",
      "de": "Militärbasis #1 → Ölraffinerie #1. Immer 1 Starken auf der MB halten.",
      "it": "Base militare #1 → Raffineria #1. Tenere sempre 1 forte sulla BM.",
      "fr": "Base mil. #1 → Raffinerie #1. Toujours 1 joueur fort sur la base.",
      "es": "Base mil. #1 → Refinería #1. Siempre 1 jugador fuerte en la base.",
      "pt": "Base mil. #1 → Refinaria #1. Sempre 1 jogador forte na base.",
      "ar": "القاعدة #1 ← المصفاة #1. اترك دائماً لاعباً قوياً في القاعدة."}),
    ("T2", ["MB2", "REF2"], 3, (232, 131, 58),
     {"en": "TEAM 2", "ko": "2팀", "ja": "2班", "zh": "2隊", "zh_cn": "2队", "th": "ทีม 2", "vi": "ĐỘI 2", "id": "TIM 2", "tr": "TAKIM 2", "de": "TEAM 2", "it": "SQUADRA 2", "fr": "ÉQUIPE 2", "es": "EQUIPO 2", "pt": "EQUIPA 2", "ar": "فريق 2"},
     {"en": "Military Base #2 → Oil Refinery #2. Keep 1 strong player on the MB.",
      "ko": "군사 기지 #2 → 정유 공장 #2. 군사 기지에 항상 강자 1명 유지.",
      "ja": "軍事基地#2 → 精製工場#2。基地に常に強者1人。",
      "zh": "軍事基地#2 → 煉油廠#2。基地永遠留1名強者。",
      "zh_cn": "军事基地 #2 → 炼油厂 #2。基地上始终留1名强者。",
      "th": "ฐานทหาร #2 → โรงกลั่นน้ำมัน #2 เก็บคนแข็ง 1 คนไว้ที่ฐานเสมอ",
      "vi": "Căn Cứ Quân Sự #2 → Xưởng Lọc Dầu #2. Giữ 1 người mạnh ở CCQS.",
      "id": "Pangkalan #2 → Pabrik Minyak #2. Selalu 1 pemain kuat di pangkalan.",
      "tr": "Askeri Üs #2 → Rafineri #2. Üste daima 1 güçlü oyuncu kalsın.",
      "de": "Militärbasis #2 → Ölraffinerie #2. Immer 1 Starken auf der MB halten.",
      "it": "Base militare #2 → Raffineria #2. Tenere sempre 1 forte sulla BM.",
      "fr": "Base mil. #2 → Raffinerie #2. Toujours 1 joueur fort sur la base.",
      "es": "Base mil. #2 → Refinería #2. Siempre 1 jugador fuerte en la base.",
      "pt": "Base mil. #2 → Refinaria #2. Sempre 1 jogador forte na base.",
      "ar": "القاعدة #2 ← المصفاة #2. اترك دائماً لاعباً قوياً في القاعدة."}),
    ("T3", ["FH1", "REF3"], 3, (76, 175, 125),
     {"en": "TEAM 3", "ko": "3팀", "ja": "3班", "zh": "3隊", "zh_cn": "3队", "th": "ทีม 3", "vi": "ĐỘI 3", "id": "TIM 3", "tr": "TAKIM 3", "de": "TEAM 3", "it": "SQUADRA 3", "fr": "ÉQUIPE 3", "es": "EQUIPO 3", "pt": "EQUIPA 3", "ar": "فريق 3"},
     {"en": "Field Hospital #1 → Oil Refinery #3. Both = healing speed +100%.",
      "ko": "의료 센터 #1 → 정유 공장 #3. 의료 센터 2곳 유지 시 치료 +100%.",
      "ja": "医療ST#1 → 精製工場#3。医療2箇所で治療+100%。",
      "zh": "醫療站#1 → 煉油廠#3。兩座醫療站治療+100%。",
      "zh_cn": "医疗站 #1 → 炼油厂 #3。两座齐守 = 治疗+100%。",
      "th": "สถานีรักษา #1 → โรงกลั่นน้ำมัน #3 ทั้งคู่ = ความเร็วรักษา +100%",
      "vi": "Trạm Xá #1 → Xưởng Lọc Dầu #3. Cả hai = tốc độ hồi máu +100%.",
      "id": "Pos Medis #1 → Pabrik Minyak #3. Dua pos medis = sembuh +100%.",
      "tr": "Sağlık İst. #1 → Rafineri #3. İki sağlık = tedavi +100%.",
      "de": "Feldlazarett #1 → Ölraffinerie #3. Beide = Heiltempo +100%.",
      "it": "Stazione medica #1 → Raffineria #3. Entrambe = cura +100%.",
      "fr": "Poste méd. #1 → Raffinerie #3. Deux postes = soins +100%.",
      "es": "Est. médica #1 → Refinería #3. Dos estaciones = curación +100%.",
      "pt": "Posto méd. #1 → Refinaria #3. Dois postos = cura +100%.",
      "ar": "محطة العلاج #1 ← المصفاة #3. محطتان = علاج +100%."}),
    ("T4", ["FH2", "REF4"], 3, (46, 155, 166),
     {"en": "TEAM 4", "ko": "4팀", "ja": "4班", "zh": "4隊", "zh_cn": "4队", "th": "ทีม 4", "vi": "ĐỘI 4", "id": "TIM 4", "tr": "TAKIM 4", "de": "TEAM 4", "it": "SQUADRA 4", "fr": "ÉQUIPE 4", "es": "EQUIPO 4", "pt": "EQUIPA 4", "ar": "فريق 4"},
     {"en": "Field Hospital #2 → Oil Refinery #4. Both = healing speed +100%.",
      "ko": "의료 센터 #2 → 정유 공장 #4. 의료 센터 2곳 유지 시 치료 +100%.",
      "ja": "医療ST#2 → 精製工場#4。医療2箇所で治療+100%。",
      "zh": "醫療站#2 → 煉油廠#4。兩座醫療站治療+100%。",
      "zh_cn": "医疗站 #2 → 炼油厂 #4。两座齐守 = 治疗+100%。",
      "th": "สถานีรักษา #2 → โรงกลั่นน้ำมัน #4 ทั้งคู่ = ความเร็วรักษา +100%",
      "vi": "Trạm Xá #2 → Xưởng Lọc Dầu #4. Cả hai = tốc độ hồi máu +100%.",
      "id": "Pos Medis #2 → Pabrik Minyak #4. Dua pos medis = sembuh +100%.",
      "tr": "Sağlık İst. #2 → Rafineri #4. İki sağlık = tedavi +100%.",
      "de": "Feldlazarett #2 → Ölraffinerie #4. Beide = Heiltempo +100%.",
      "it": "Stazione medica #2 → Raffineria #4. Entrambe = cura +100%.",
      "fr": "Poste méd. #2 → Raffinerie #4. Deux postes = soins +100%.",
      "es": "Est. médica #2 → Refinería #4. Dos estaciones = curación +100%.",
      "pt": "Posto méd. #2 → Refinaria #4. Dois postos = cura +100%.",
      "ar": "محطة العلاج #2 ← المصفاة #4. محطتان = علاج +100%."}),
    ("T5", ["REF5"], 3, (74, 127, 212),
     {"en": "TEAM 5", "ko": "5팀", "ja": "5班", "zh": "5隊", "zh_cn": "5队", "th": "ทีม 5", "vi": "ĐỘI 5", "id": "TIM 5", "tr": "TAKIM 5", "de": "TEAM 5", "it": "SQUADRA 5", "fr": "ÉQUIPE 5", "es": "EQUIPO 5", "pt": "EQUIPA 5", "ar": "فريق 5"},
     {"en": "Oil Refinery #5. Only one building to keep.",
      "ko": "정유 공장 #5. 거점이 하나뿐.",
      "ja": "精製工場#5。守る拠点は1つだけ。",
      "zh": "煉油廠#5。只需守住一座。",
      "zh_cn": "炼油厂 #5。只有一座据点要守。",
      "th": "โรงกลั่นน้ำมัน #5 มีสิ่งก่อสร้างเดียวที่ต้องรักษา",
      "vi": "Xưởng Lọc Dầu #5. Chỉ một công trình cần giữ.",
      "id": "Pabrik Minyak #5. Hanya satu bangunan untuk ditahan.",
      "tr": "Rafineri #5. Tutulacak tek bina.",
      "de": "Ölraffinerie #5. Nur ein Gebäude zu halten.",
      "it": "Raffineria #5. Un solo edificio da tenere.",
      "fr": "Raffinerie #5. Un seul bâtiment à tenir.",
      "es": "Refinería #5. Solo un edificio que mantener.",
      "pt": "Refinaria #5. Só um edifício para segurar.",
      "ar": "المصفاة #5. مبنى واحد فقط للحفاظ عليه."}),
    ("T6", ["REF6"], 3, (155, 107, 214),
     {"en": "TEAM 6", "ko": "6팀", "ja": "6班", "zh": "6隊", "zh_cn": "6队", "th": "ทีม 6", "vi": "ĐỘI 6", "id": "TIM 6", "tr": "TAKIM 6", "de": "TEAM 6", "it": "SQUADRA 6", "fr": "ÉQUIPE 6", "es": "EQUIPO 6", "pt": "EQUIPA 6", "ar": "فريق 6"},
     {"en": "Oil Refinery #6. Only one building to keep.",
      "ko": "정유 공장 #6. 거점이 하나뿐.",
      "ja": "精製工場#6。守る拠点は1つだけ。",
      "zh": "煉油廠#6。只需守住一座。",
      "zh_cn": "炼油厂 #6。只有一座据点要守。",
      "th": "โรงกลั่นน้ำมัน #6 มีสิ่งก่อสร้างเดียวที่ต้องรักษา",
      "vi": "Xưởng Lọc Dầu #6. Chỉ một công trình cần giữ.",
      "id": "Pabrik Minyak #6. Hanya satu bangunan untuk ditahan.",
      "tr": "Rafineri #6. Tutulacak tek bina.",
      "de": "Ölraffinerie #6. Nur ein Gebäude zu halten.",
      "it": "Raffineria #6. Un solo edificio da tenere.",
      "fr": "Raffinerie #6. Un seul bâtiment à tenir.",
      "es": "Refinería #6. Solo un edificio que mantener.",
      "pt": "Refinaria #6. Só um edifício para segurar.",
      "ar": "المصفاة #6. مبنى واحد فقط للحفاظ عليه."}),
]


def build_cells() -> list:
    return [Cell(name.get(LANG, name["en"]), objs, seats, color,
                 brief.get(LANG, brief["en"]), key)
            for key, objs, seats, color, name, brief in CELL_DEFS]


# Draft order: the CP-sorted roster is poured into these seats top to bottom.
# Each tier lists which cell receives the next-strongest player.
# Totals: 2 + 4 + 4 + 2 + 8 = 20.
DRAFT_TIERS_DEFAULT = [
    ("ALLOY  (2 strongest)",  ["ALLOYS", "ALLOYS"]),
    ("WHALE  (military)",     ["T1", "T2", "T1", "T2"]),
    ("STRONG (1 per cell)",   ["T3", "T4", "T5", "T6"]),
    ("FLEX   (3rd seat)",     ["T1", "T2"]),
    # snake order so the four 3-player cells end up with comparable total CP
    ("NORMAL (snake)",        ["T3", "T4", "T5", "T6",
                               "T6", "T5", "T4", "T3"]),
]

# --strengthen-hospitals: spread the whales so each Field Hospital gets one.
# Addresses BATTLE_PLAN.md §4.4 — the FHs score the same as the MBs but are
# otherwise defended by the weakest cells.
DRAFT_TIERS_HOSPITAL = [
    ("ALLOY  (2 strongest)",  ["ALLOYS", "ALLOYS"]),
    ("WHALE  (mil + hosp)",   ["T1", "T2", "T3", "T4"]),
    ("STRONG (1 per cell)",   ["T1", "T2", "T5", "T6"]),
    ("FLEX   (3rd seat)",     ["T3", "T4"]),
    ("NORMAL (snake)",        ["T1", "T2", "T5", "T6",
                               "T6", "T5", "T4", "T3"]),
]

# ---------------------------------------------------------------------------
# 4. ROSTER LOADING
# ---------------------------------------------------------------------------

@dataclass
class Player:
    name: str
    cp: int
    role: str = "starter"       # starter | secondary
    seat: str = ""              # tier label, filled by allocate()
    cell: str = ""



# ---------------------------------------------------------------------------
# 5. ALLOCATION
# ---------------------------------------------------------------------------

@dataclass
class Lineup:
    label: str
    cells: list
    subs: list
    warnings: list

    @property
    def fielded(self) -> list:
        return [p for c in self.cells for p in c.players]

    @property
    def total_cp(self) -> int:
        return sum(p.cp for p in self.fielded)


def allocate(players: list, label: str, strengthen_hospitals: bool = False,
             ignore_roles: bool = False) -> Lineup:
    """Pour the CP-sorted roster into the draft tiers."""
    warnings = []
    cells = build_cells()
    by_key = {c.key: c for c in cells}   # draft tiers use the stable id
    tiers = DRAFT_TIERS_HOSPITAL if strengthen_hospitals else DRAFT_TIERS_DEFAULT
    total_seats = sum(len(t[1]) for t in tiers)

    if ignore_roles:
        # planning mode: pick the best 20 by CP regardless of how the roster is
        # currently flagged, so an admin can see what the lineup *should* be
        # before registration locks.
        ranked = sorted(players, key=lambda p: -p.cp)
        misflagged = [p for p in ranked[:total_seats] if p.role == "secondary"]
        if misflagged:
            warnings.append(
                f"--ignore-roles: {len(misflagged)} player(s) currently flagged Secondary "
                f"are in the top {total_seats} by CP "
                f"({', '.join(p.name for p in misflagged[:4])}"
                f"{'...' if len(misflagged) > 4 else ''}) — promote them to Starter.")
        starters, secondaries = ranked, []
    else:
        starters = sorted([p for p in players if p.role == "starter"],
                          key=lambda p: -p.cp)
        secondaries = sorted([p for p in players if p.role == "secondary"],
                             key=lambda p: -p.cp)

    if len(starters) > total_seats:
        warnings.append(
            f"{len(starters)} starters on the roster but only {total_seats} seats — "
            f"the {len(starters) - total_seats} lowest-CP starter(s) moved to the sub ladder.")
    fielded = starters[:total_seats]
    bench = starters[total_seats:] + secondaries

    if len(fielded) < total_seats:
        need = total_seats - len(fielded)
        promoted = bench[:need]
        if promoted:
            warnings.append(
                f"only {len(starters)} starters — promoted {len(promoted)} "
                f"secondary/ies into the lineup to fill {total_seats} seats.")
        fielded += promoted
        bench = bench[need:]
    if len(fielded) < total_seats:
        warnings.append(
            f"roster is short: {len(fielded)} players for {total_seats} seats. "
            f"{total_seats - len(fielded)} seat(s) left EMPTY.")

    # pour into seats
    seq = [(tier_label, cell_name) for tier_label, names in tiers for cell_name in names]
    for player, (tier_label, cell_name) in zip(fielded, seq):
        player.seat = tier_label.split("(")[0].strip()
        player.cell = by_key[cell_name].name
        by_key[cell_name].players.append(player)

    return Lineup(label, cells, bench, warnings)


# ---------------------------------------------------------------------------
# 6. FORMATTING HELPERS
# ---------------------------------------------------------------------------

# Cells whose lead must NOT leave their building for the ball. The Military
# Bases carry the attack buff and are the one hold we never trade (§5.2/§5.5).
ANCHOR_CELLS = {"T1", "T2"}


def mark_of(cell, idx: int):
    """'ball'   — highlighted player joins the ball fight if Team Alloys can't
                  deliver on their own.
       'anchor' — highlighted player is locked to their Military Base."""
    if idx not in emphasised(cell):
        return None
    if cell.key in ANCHOR_CELLS:
        return "anchor"
    return "ball"


def emphasised(cell) -> set:
    """Indices of players rendered in bold: each cell's strongest player.
    Team Alloys emphasises both, since both of them run the ball."""
    if not cell.players:
        return set()
    if cell.objectives[:1] == ["FACTORY"]:
        return set(range(len(cell.players)))
    top = max(p.cp for p in cell.players)
    return {i for i, p in enumerate(cell.players) if p.cp == top}


def pretty_team(name: str) -> str:
    """'teamA' -> 'TEAM A' (en) / 'A팀' (ko)."""
    m = re.match(r"^\s*team\s*(.+?)\s*$", name, re.I)
    if not m:
        return name.upper()
    part = m.group(1).upper()
    if LANG == "ko":
        return f"{part}팀"
    if LANG == "tr":
        return f"TAKIM {part}"
    if LANG == "id":
        return f"TIM {part}"
    if LANG in ("ja", "zh"):
        return f"{part}チーム" if LANG == "ja" else f"{part}隊"
    if LANG in ("fr", "es"):
        return f"EQUIPO {part}" if LANG == "es" else f"ÉQUIPE {part}"
    if LANG == "pt":
        return f"EQUIPA {part}"
    if LANG == "ar":
        return f"فريق {part}"
    return f"TEAM {part}"


_MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
              "août", "septembre", "octobre", "novembre", "décembre"]
_MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
              "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
_MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
              "agosto", "setembro", "outubro", "novembro", "dezembro"]
_MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو",
              "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
_MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
              "Agustus", "September", "Oktober", "November", "Desember"]

_MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz",
              "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]

_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"]


def pretty_date(s: str) -> str:
    """'20260816' -> '2026, August 16th'. Left alone if not a YYYYMMDD folder."""
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", s.strip())
    if not m:
        return s
    y, mo, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not 1 <= mo <= 12:
        return s
    if LANG == "ko":
        return f"{y}년 {mo}월 {dd}일"
    if LANG == "tr":
        return f"{dd} {_MONTHS_TR[mo - 1]} {y}"
    if LANG == "id":
        return f"{dd} {_MONTHS_ID[mo - 1]} {y}"
    if LANG in ("ja", "zh"):
        return f"{y}年{mo}月{dd}日"
    if LANG == "fr":
        return f"{dd} {_MONTHS_FR[mo - 1]} {y}"
    if LANG == "es":
        return f"{dd} de {_MONTHS_ES[mo - 1]} de {y}"
    if LANG == "pt":
        return f"{dd} de {_MONTHS_PT[mo - 1]} de {y}"
    if LANG == "ar":
        return f"{dd} {_MONTHS_AR[mo - 1]} {y}"
    suffix = "th" if 11 <= dd % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(dd % 10, "th")
    return f"{y}, {_MONTHS[mo - 1]} {dd}{suffix}"


def fmt_cp(cp: int) -> str:
    if cp >= 1_000_000_000:
        return f"{cp / 1e9:.2f}B"
    if cp >= 1_000_000:
        return f"{cp / 1e6:.1f}M"
    if cp >= 1_000:
        return f"{cp / 1e3:.0f}K"
    return str(cp)


def text_report(lu: Lineup) -> str:
    out = [f"BGB LINEUP — {lu.label}",
           f"{'=' * 60}",
           f"fielded {len(lu.fielded)}/20   total CP {fmt_cp(lu.total_cp)}", ""]
    for c in lu.cells:
        objs = " + ".join(BUILDING_TYPES[OBJ_BY_KEY[k].type]["short"] + " " +
                          k.replace("MB", "#").replace("FH", "#").replace("REF", "#")
                          if k != "FACTORY" else "RARE EARTH ALLOY"
                          for k in c.objectives)
        out.append(f"{c.name:<12} [{fmt_cp(c.cp):>7}]  {objs}")
        for p in c.players:
            out.append(f"    {p.name:<24} {fmt_cp(p.cp):>8}   ({p.seat})")
        out.append(f"    -> {c.brief}")
        out.append("")
    if lu.subs:
        out.append("SUBSTITUTE BACKFILL LADDER (enter at +5:00, highest sub takes the highest-value empty seat)")
        for i, p in enumerate(lu.subs, 1):
            out.append(f"  {i:>2}. {p.name:<24} {fmt_cp(p.cp):>8}")
        out.append("")
    for w in lu.warnings:
        out.append(f"!! {w}")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 7. RENDERING
# ---------------------------------------------------------------------------

# A font collection (.ttc) holds several faces, and their order is the file's
# own business — Debian's Noto CJK does not number them the way macOS numbers
# Songti. An entry below may therefore name the face it wants instead of its
# index, and be resolved by asking the file. A name that no face matches drops
# that candidate rather than picking the wrong one.
_ttc_cache: dict = {}


def _face_index(path: str, idx):
    """The index `idx` names, or None if this file has no such face."""
    if isinstance(idx, int):
        return idx
    key = (path, idx)
    if key in _ttc_cache:
        return _ttc_cache[key]
    from PIL import ImageFont
    found = None
    for i in range(16):
        try:
            family, style = ImageFont.truetype(path, 10, index=i).getname()
        except Exception:  # noqa: BLE001 - ran past the end of the collection
            break
        if idx.casefold() in f"{family} {style}".casefold():
            found = i
            break
    _ttc_cache[key] = found
    return found


# Latin, and the fallback for everything with no face of its own. A Mac has one
# pan-Unicode face; Debian has none, so DejaVu carries Latin there and the
# scripts it cannot draw are named per language below.
FONT_CANDIDATES_REGULAR = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "C:/Windows/Fonts/arialuni.ttf",
    "C:/Windows/Fonts/arial.ttf",
]
FONT_CANDIDATES_BOLD = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
] + FONT_CANDIDATES_REGULAR

# Arial Bold has no CJK coverage — Korean names render as tofu boxes in bold.
# These are faces that DO cover CJK; used as a per-string fallback. The regular
# list matters as much as the bold one on Linux, where the Latin faces have no
# Hangul or kana at all and half the alliance's names are written in them.
FONT_CANDIDATES_CJK_BOLD = [
    ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 6),      # Apple SD Gothic Neo Bold
    ("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 0),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "CJK KR"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
    ("C:/Windows/Fonts/malgunbd.ttf", 0),
] + [(p, 0) for p in FONT_CANDIDATES_REGULAR]

FONT_CANDIDATES_CJK_REGULAR = [
    ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0),
    ("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 0),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "CJK KR"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
    ("C:/Windows/Fonts/malgun.ttf", 0),
] + [(p, 0) for p in FONT_CANDIDATES_REGULAR]

_font_cache = {}
_font_src = {}
_font_key = {}
_cmap_cache = {}

# Scripts the default faces cannot draw. Korean, Japanese, Chinese and Thai each
# pick their own bold face on a Mac because Arial Bold has no glyphs for them;
# on Debian the plain face has none either, so those languages name a regular
# face too. A language absent from a table takes the default.
#
# Debian's choices are not obvious and were checked against the real files:
#   * Noto CJK lives under opentype/, not truetype/, and holds ten faces.
#   * NotoSansThai and NotoSansArabic hold their own script and nothing else —
#     no Latin letters at all — so neither can be a card's main face. Thai comes
#     from TLWG's Loma, the one packaged face carrying both; Arabic needs no
#     entry, because DejaVu covers it, shapes it, and carries Latin as well.
_NOTO_CJK_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
_NOTO_CJK_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
_LOMA = "/usr/share/fonts/truetype/tlwg/Loma"

REGULAR_BY_LANG = {
    "ko": [(_NOTO_CJK_R, "CJK KR")],
    "ja": [(_NOTO_CJK_R, "CJK JP")],
    "zh": [(_NOTO_CJK_R, "CJK TC")],
    "zh_cn": [(_NOTO_CJK_R, "CJK SC")],
    "th": [(f"{_LOMA}.ttf", 0)],
}
BOLD_BY_LANG = {
    "ko": [("/System/Library/Fonts/AppleSDGothicNeo.ttc", 6),
           (_NOTO_CJK_B, "CJK KR"),
           ("C:/Windows/Fonts/malgunbd.ttf", 0)],
    "ja": [("/System/Library/Fonts/Supplemental/Songti.ttc", 1),
           ("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 0),
           (_NOTO_CJK_B, "CJK JP"),
           ("C:/Windows/Fonts/msgothic.ttc", 0)],
    "zh": [("/System/Library/Fonts/Supplemental/Songti.ttc", 2),   # Songti TC Bold
           ("/System/Library/Fonts/Supplemental/Songti.ttc", 1),
           (_NOTO_CJK_B, "CJK TC"),
           ("C:/Windows/Fonts/msjh.ttc", 0)],
    "zh_cn": [("/System/Library/Fonts/Supplemental/Songti.ttc", 1),  # Songti SC Bold
              ("/System/Library/Fonts/Supplemental/Songti.ttc", 0),
              (_NOTO_CJK_B, "CJK SC"),
              ("C:/Windows/Fonts/msyhbd.ttc", 0)],
    # Arial Bold has no Thai glyphs either.
    "th": [("/System/Library/Fonts/Supplemental/Thonburi.ttc", 1),   # Thonburi Bold
           ("/System/Library/Fonts/Supplemental/Ayuthaya.ttf", 0),
           (f"{_LOMA}-Bold.ttf", 0),
           ("C:/Windows/Fonts/leelawdb.ttf", 0)],
}

_bold_override = None
_regular_override = None


def set_bold_override(cands) -> None:
    """Point plain bold at a language-specific face (CJK). None = default."""
    global _bold_override
    if cands != _bold_override:
        _bold_override = cands
        _font_cache.clear()
        _font_src.clear()


def set_regular_override(cands) -> None:
    """Point the plain face at a language-specific one. None = default."""
    global _regular_override
    if cands != _regular_override:
        _regular_override = cands
        _font_cache.clear()
        _font_src.clear()


def font(size: int, bold: bool = False, cjk: bool = False, plain: bool = False):
    """A face for the current language, or with `plain`, the widest one there is.

    `plain` ignores the language's own faces. It exists for player names, which
    are the one thing on the card written in nobody's chosen language.
    """
    from PIL import ImageFont
    key = (size, bold, cjk, plain)
    if key in _font_cache:
        return _font_cache[key]
    if plain:
        cands = [(p, 0) for p in (FONT_CANDIDATES_BOLD if bold else FONT_CANDIDATES_REGULAR)]
    elif cjk:
        cands = FONT_CANDIDATES_CJK_BOLD if bold else FONT_CANDIDATES_CJK_REGULAR
    elif bold and _bold_override:
        cands = list(_bold_override) + FONT_CANDIDATES_CJK_BOLD
    elif bold:
        cands = [(p, 0) for p in FONT_CANDIDATES_BOLD]
    elif _regular_override:
        cands = list(_regular_override) + [(p, 0) for p in FONT_CANDIDATES_REGULAR]
    else:
        cands = [(p, 0) for p in FONT_CANDIDATES_REGULAR]
    for path, want in cands:
        if os.path.exists(path):
            idx = _face_index(path, want)
            if idx is None:
                continue
            try:
                f = ImageFont.truetype(path, size, index=idx)
                _font_cache[key] = f
                _font_src[key] = (path, idx)
                _font_key[id(f)] = key
                return f
            except Exception:
                continue
    _font_cache[key] = ImageFont.load_default()
    _font_src[key] = None
    return _font_cache[key]


def _cmap(path: str, idx: int):
    """Set of codepoints a font file actually maps, or None if unknowable.
    NOTE: Pillow renders unmapped codepoints as a visible .notdef box, so
    getbbox() cannot be used to detect missing glyphs — read the cmap instead."""
    key = (path, idx)
    if key in _cmap_cache:
        return _cmap_cache[key]
    cps = None
    try:
        from fontTools.ttLib import TTFont
        tt = TTFont(path, fontNumber=idx, lazy=True)
        cps = set()
        for t in tt["cmap"].tables:
            cps.update(t.cmap.keys())
        tt.close()
    except Exception:
        cps = None
    _cmap_cache[key] = cps
    return cps


def _ignorable(ch: str) -> bool:
    """Formatting marks the shaper consumes, which no font needs a glyph for.

    The Arabic strings wrap their numbers in directional isolates and `bidi_num`
    adds left-to-right marks; both are invisible, and counting them as missing
    would push every Arabic string onto a worse face for no reason.
    """
    cp = ord(ch)
    return ch.isspace() or 0x200B <= cp <= 0x200F or 0x2028 <= cp <= 0x202E \
        or 0x2060 <= cp <= 0x206F or cp == 0xFEFF


def _uncovered(size: int, bold: bool, cjk: bool, text: str, plain: bool = False) -> int:
    """How many characters of `text` this face has no glyph for."""
    src = _font_src.get((size, bold, cjk, plain))
    if not src:
        return 0
    cps = _cmap(*src)
    if cps is None:                       # fontTools unavailable — be conservative
        return sum(1 for ch in text if not _ignorable(ch) and ord(ch) >= 0x0250)
    return sum(1 for ch in text if not _ignorable(ch) and ord(ch) not in cps)


def _covers(size: int, bold: bool, cjk: bool, text: str, plain: bool = False) -> bool:
    return _uncovered(size, bold, cjk, text, plain) == 0


def name_font(text: str, size: int, bold: bool):
    """Font for a player name, stepping off the language's own face when it has
    no glyphs for the name.

    Names are the one thing on the card written in nobody's chosen language, and
    on Linux no single installed face covers them all: the Thai face holds no
    Latin, and the CJK ones have no Turkish ı. So a name that the language's
    face cannot draw falls back to the widest face there is, and boldness is
    given up before legibility is.
    """
    attempts = [
        (bold, False, False),      # the language's own face
        (bold, True, False),       # one that covers CJK
        (bold, False, True),       # the widest face there is
        (False, False, True),      # ... giving up the boldness for it
    ]
    best, fewest = None, None
    for is_bold, cjk, plain in attempts:
        chosen = font(size, is_bold, cjk, plain)     # also resolves the source
        missing = _uncovered(size, is_bold, cjk, text, plain)
        if missing == 0:
            return chosen
        # Some strings no single installed face covers — a Thai line with an
        # arrow in it, say. Losing the arrow beats losing the sentence, so the
        # face that draws the most of it wins rather than the last one tried.
        if fewest is None or missing < fewest:
            best, fewest = chosen, missing
    return best or font(size, False, plain=True)


# A plain stand-in beats an empty box, for marks that carry meaning rather than
# words. Every Thai face Debian packages — Loma, Garuda, Norasi, Waree, Kinnari
# — holds Thai and Latin and about four hundred codepoints in total, no arrow
# among them; "A > B" says what "A → B" says.
SUBSTITUTES = {"→": ">", "←": "<", "↔": "<>", "·": "-", "…": "..."}


def _font_cmap(f):
    path = getattr(f, "path", None)
    return _cmap(path, getattr(f, "index", 0)) if path else None


def covering(text: str, f):
    """`text`, and a face that can draw it — substituting for what none can."""
    key = _font_key.get(id(f))
    if key is None:
        return text, f
    size, bold, _, _ = key
    chosen = name_font(text, size, bold)
    cps = _font_cmap(chosen)
    if cps is not None and any(ch in SUBSTITUTES and ord(ch) not in cps for ch in text):
        text = "".join(SUBSTITUTES[ch] if ch in SUBSTITUTES and ord(ch) not in cps else ch
                       for ch in text)
        chosen = name_font(text, size, bold)   # the swap may free up a better face
    return text, chosen


def covering_draw(draw):
    """Wrap a drawing context so every string gets a face that can draw it.

    A Mac has one pan-Unicode face and this changes nothing there. Linux has
    none: the Thai face carries no arrow, the Latin ones no Hangul or kana, and
    a card holds our own text and the members' names side by side. Measuring
    goes through the same swap as drawing, or the two disagree and the layout
    clips text that fits.
    """
    for method in ("text", "textbbox"):
        plain = getattr(draw, method)

        def wrapped(*args, _plain=plain, font=None, **kw):
            text = args[1] if len(args) > 1 else kw.get("text")
            if text and font is not None:
                text, font = covering(text, font)
                args = (args[0], text, *args[2:]) if len(args) > 1 else args
                if "text" in kw:
                    kw["text"] = text
            return _plain(*args, font=font, **kw)

        setattr(draw, method, wrapped)
    return draw


# palette — dark industrial, matching the BGB oil-field look
BG          = (24, 21, 18)
PANEL       = (38, 33, 28)
PANEL_EDGE  = (72, 62, 50)
MAP_BG      = (46, 39, 31)
GRID        = (58, 50, 40)
INK         = (238, 230, 216)
INK_DIM     = (168, 156, 140)
INK_FAINT   = (120, 110, 98)
ACCENT      = (242, 177, 56)
UNLOCK      = (126, 196, 232)   # MB/FH contestable marker on the battle clock
SUBIN       = (190, 162, 230)   # substitute-entry marker on the battle clock
MARK_BALL   = (242, 177, 56)    # lead who reinforces the ball
MARK_ANCHOR = (232, 116, 96)    # lead locked to their Military Base
ENEMY       = (196, 74, 74)

TYPE_ACCENT = {
    "factory":  (242, 177, 56),
    "military": (214, 96, 84),
    "hospital": (96, 190, 140),
    "refinery": (126, 158, 196),
    "tank":     (150, 132, 108),
}


def draw_mark(d, box, kind) -> None:
    """Ball reserve = filled circle. Building anchor = filled diamond."""
    x0, y0, x1, y1 = box
    if kind == "ball":
        d.ellipse(box, fill=MARK_BALL)
    else:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        d.polygon([(cx, y0 - 1), (x1 + 1, cy), (cx, y1 + 1), (x0 - 1, cy)],
                  fill=MARK_ANCHOR)


def _tw(draw, text, f):
    b = draw.textbbox((0, 0), text, font=f)
    return b[2] - b[0], b[3] - b[1]


def _center(draw, xy, text, f, fill):
    b = draw.textbbox((0, 0), text, font=f)
    draw.text((xy[0] - (b[2] - b[0]) / 2 - b[0], xy[1] - (b[3] - b[1]) / 2 - b[1]),
              text, font=f, fill=fill)


def _clip(draw, text, f, max_w):
    if _tw(draw, text, f)[0] <= max_w:
        return text
    while text and _tw(draw, text + "…", f)[0] > max_w:
        text = text[:-1]
    return text + "…"




def objs_label(c) -> str:
    return " + ".join(
        short_of("factory") if k == "FACTORY" else
        short_of(OBJ_BY_KEY[k].type) +
        (" #" + "".join(ch for ch in k if ch.isdigit())
         if any(ch.isdigit() for ch in k) else "")
        for k in c.objectives)


def render(lu: Lineup, out_path: str, subtitle: str = "") -> str:
    from PIL import Image, ImageDraw

    W = 1900
    MARGIN, GAP = 26, 14

    probe = covering_draw(ImageDraw.Draw(Image.new("RGB", (8, 8))))
    stat = t("stat", n=len(lu.fielded), cp=fmt_cp(lu.total_cp))
    ident = f"PoU  ·  {lu.label}"
    title_lines = t("title")
    # Language badge, top-right. Uses the --lang code itself so the image says
    # which file it is (EN / KO / ZH-CN ...), matching the _<lang> filename.
    lang_tag = LANG.upper().replace("_", "-")
    lang_name = LANG_NAMES.get(LANG, "")
    tag_nf = name_font(lang_name, 12, False) if lang_name else None
    tag_w = 18 + max(_tw(probe, lang_tag, font(13, True))[0],
                     _tw(probe, lang_name, tag_nf)[0] if lang_name else 0)
    tag_h = 38 if lang_name else 22

    # ---------------- measurement pass ----------------
    # Size the two side panels to what their content actually needs, then hand
    # every leftover pixel to the map. The title block sits at the top of the
    # right column, so it constrains the column width too.
    name_w = cp_w = 0
    for c in lu.cells:
        lead = emphasised(c)
        for i, p in enumerate(c.players):
            f = name_font(p.name, 15, i in lead)
            name_w = max(name_w, _tw(probe, p.name, f)[0])
            cp_w = max(cp_w, _tw(probe, fmt_cp(p.cp), f)[0])
    PW = int(max(
        42 + name_w + 18 + cp_w + 28,                                   # roster rows
        52 + max(_tw(probe, objs_label(c), font(13))[0] for c in lu.cells),
        40 + _tw(probe, t("assign"), font(20, True))[0],
        40 + _tw(probe, t("cap_prio"), font(12, True))[0],
        40 + _tw(probe, t("prio_top"), font(12, True))[0],
        40 + _tw(probe, t("cap_order"), font(12, True))[0],
        *(36 + _tw(probe, ln, font(30, True))[0] + (tag_w + 12 if i == 0 else 0)
          for i, ln in enumerate(title_lines)),
        36 + _tw(probe, ident, font(16))[0],
        36 + _tw(probe, stat, font(14))[0],
        36 + _tw(probe, subtitle, font(14))[0] if subtitle else 0,
    ))
    PW = max(300, min(PW, 700))

    n_clock = 4 + (SUB_ENTRY_MIN is not None) + (CONTEST_UNLOCK_MIN is not None)
    n_warn = len(lu.warnings[:2])
    ORDER_ROW, RULE_ROW = 18, 19
    RULE_KEYS = ["r1", "r2", "r3", "r4", "r5"]
    BH = max(
        98 + n_clock * 20 + (24 + n_warn * 18 if n_warn else 0) + 18,   # clock column
        14 + 26 + ORDER_ROW * len(lu.cells) + 8 + 34 + 14,              # standing orders
        14 + 26 + RULE_ROW * len(RULE_KEYS) + 10 + 20 + 14,             # rules column
    )

    TITLE_H = 118 + 34 * len(title_lines) + (22 if subtitle else 0)
    MX, MY = MARGIN, MARGIN
    MW = W - 2 * MARGIN - GAP - PW
    H = 1590
    MH = H - MY - GAP - BH - MARGIN
    PX0 = MX + MW + GAP
    PY0, PH = MY + TITLE_H, MH - TITLE_H

    # map contents scale with the map, so a bigger frame means bigger markers
    S = (MW / 1130.0) * 1.12

    def sc(v):
        return v * S

    def mf(size, bold=False):
        return font(max(9, int(round(size * S))), bold)

    def mnf(text, size, bold):
        return name_font(text, max(9, int(round(size * S))), bold)

    img = Image.new("RGB", (W, H), BG)
    d = covering_draw(ImageDraw.Draw(img))

    cell_by_obj = {}
    for c in lu.cells:
        for k in c.objectives:
            cell_by_obj[k] = c

    # ---------------- title block (top of the right column) ----------------
    hx, hy = PX0 + 18, MY + 6
    for i, ln in enumerate(title_lines):
        d.text((hx, hy + 34 * i), ln, font=font(30, True), fill=INK)
    tx1, ty1 = PX0 + PW - 18, hy + 4
    d.rounded_rectangle([tx1 - tag_w, ty1, tx1, ty1 + tag_h], 6,
                        fill=MAP_BG, outline=ACCENT, width=2)
    tcx = (tx1 - tag_w + tx1) / 2
    if lang_name:
        _center(d, (tcx, ty1 + 12), lang_tag, font(13, True), ACCENT)
        _center(d, (tcx, ty1 + 27), lang_name, tag_nf, INK_DIM)
    else:
        _center(d, (tcx, ty1 + tag_h / 2), lang_tag, font(13, True), ACCENT)
    ty0 = hy + 34 * len(title_lines) + 8
    d.text((hx, ty0), ident, font=font(16), fill=ACCENT)
    d.text((hx, ty0 + 24), stat, font=font(14), fill=INK_DIM)
    if subtitle:
        d.text((hx, ty0 + 44), subtitle, font=font(14), fill=INK_DIM)
    d.line([PX0 + 18, MY + TITLE_H - 14, PX0 + PW - 18, MY + TITLE_H - 14],
           fill=ACCENT, width=3)

    # ---------------- map panel ----------------
    d.rounded_rectangle([MX, MY, MX + MW, MY + MH], 14, fill=MAP_BG, outline=PANEL_EDGE, width=2)
    for i in range(1, 10):
        gx = MX + MW * i / 10
        gy = MY + MH * i / 10
        d.line([gx, MY + 4, gx, MY + MH - 4], fill=GRID)
        d.line([MX + 4, gy, MX + MW - 4, gy], fill=GRID)

    def px(o):
        return MX + o.x * MW, MY + o.y * MH

    # --- geometry pre-pass -------------------------------------------------
    # Work out every marker box and name-plate box BEFORE drawing, so the
    # connector lines can be routed around the plates instead of through them.
    # A plate that would run off the bottom of the map flips above its marker.
    PLATE_HEAD = sc(30)      # team-name header bar inside each plate
    ROW_H = sc(20)
    geom = {}
    for o in MAP_OBJECTIVES:
        cx, cy = px(o)
        if o.type == "base":
            hw, hh = sc(34), sc(34)
        elif o.type == "tank":
            hw, hh = sc(15), sc(15)
        elif o.type in ("factory", "military", "hospital"):
            hw, hh = sc(108), sc(46)
        else:
            hw, hh = sc(92), sc(40)

        plate = None
        cell = cell_by_obj.get(o.key)
        if cell and o.key == cell.objectives[0]:
            rows = [(_clip(d, p.name, mf(14), sc(168)), fmt_cp(p.cp)) for p in cell.players]
            need = max([_tw(d, f"{n}  {c}", mf(14))[0] for n, c in rows] +
                       [_tw(d, cell.name, mf(18, True))[0] + sc(24)])
            pw = max(sc(200), min(sc(258), need + sc(26)))
            ph = PLATE_HEAD + ROW_H * len(rows) + sc(8)
            top = cy + hh + sc(8)
            if top + ph > MY + MH - 12:                      # would overflow -> go above
                top = cy - hh - sc(8) - ph
            x0 = max(MX + 8, min(cx - pw / 2, MX + MW - 8 - pw))   # keep inside the map
            plate = (x0, top, x0 + pw, top + ph)
        elif cell:
            bw2 = _tw(d, cell.name, mf(15, True))[0] // 2 + sc(13)
            bh2 = sc(24)
            top = cy + hh + sc(8)
            if top + bh2 > MY + MH - 12:
                top = cy - hh - sc(8) - bh2
            x0 = max(MX + 8, min(cx - bw2, MX + MW - 8 - 2 * bw2))
            plate = (x0, top, x0 + 2 * bw2, top + bh2)

        # A cell's connector attaches to its TEAM plate, not to the building
        # marker — the plate is what carries the team identity. For a secondary
        # building the box also swallows its TEAM badge, so a route can't cut
        # through the badge on its way in.
        is_primary = bool(cell) and o.key == cell.objectives[0]
        if plate and is_primary:
            abox = tuple(plate)
        elif plate:
            abox = (min(cx - hw, plate[0]), min(cy - hh, plate[1]),
                    max(cx + hw, plate[2]), max(cy + hh, plate[3]))
        else:
            abox = (cx - hw, cy - hh, cx + hw, cy + hh)
        geom[o.key] = dict(cx=cx, cy=cy, hw=hw, hh=hh, plate=plate,
                           abox=abox, obj=o, cell=cell)

    def elbow(a, b):
        """ㄱ-shaped route: leave A horizontally, turn once, arrive into B
        vertically. Falls back to a plain vertical drop when B sits directly
        above or below A."""
        ax0, ay0, ax1, ay1 = a["abox"]
        bx0, by0, bx1, by1 = b["abox"]
        acx, acy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
        bcx = (bx0 + bx1) / 2
        ey = by0 if by0 >= acy else by1                      # face of B pointing back at A
        if ax0 < bcx < ax1:                                  # already aligned — straight drop
            return [(bcx, ay1 if by0 >= acy else ay0), (bcx, ey)]
        sx = ax1 if bcx > acx else ax0                       # side of A facing B
        return [(sx, acy), (bcx, acy), (bcx, ey)]

    # --- draw objectives ---------------------------------------------------
    for o in MAP_OBJECTIVES:
        g = geom[o.key]
        x, y, bw, bh = g["cx"], g["cy"], g["hw"], g["hh"]
        cell = g["cell"]

        if o.type == "base":
            # fortified depot: battlemented walls, gate, and a pennant mast
            col, fillc = (176, 156, 124), (52, 44, 36)
            w, top_y, base_y = sc(34), y - sc(4), y + sc(24)
            tw_ = w * 0.78
            d.polygon([(x - w, base_y), (x + w, base_y),
                       (x + tw_, top_y), (x - tw_, top_y)],
                      fill=fillc, outline=col, width=3)
            merlon = sc(11)
            for i in range(3):
                bx = x - tw_ + (2 * tw_ - merlon) * i / 2
                d.rectangle([bx, top_y - sc(10), bx + merlon, top_y + 2],
                            fill=fillc, outline=col, width=3)
            d.rectangle([x - sc(9), base_y - sc(15), x + sc(9), base_y], fill=col)
            d.line([x, top_y - sc(10), x, y - sc(31)], fill=col, width=3)
            d.polygon([(x + 1, y - sc(31)), (x + sc(19), y - sc(25)),
                       (x + 1, y - sc(19))], fill=col)
            _center(d, (x, base_y + sc(19)), t("base"), mf(13, True), col)
            continue

        meta = BUILDING_TYPES[o.type]

        if o.type == "tank":
            d.ellipse([x - bw, y - bh, x + bw, y + bh], fill=PANEL,
                      outline=TYPE_ACCENT["tank"], width=2)
            _center(d, (x, y), "OIL", mf(11, True), TYPE_ACCENT["tank"])
            _center(d, (x, y + bh + sc(12)), "+300/min", mf(12), INK_FAINT)
            continue

        big = o.type in ("factory", "military", "hospital")
        accent = cell.color if cell else TYPE_ACCENT[o.type]
        strip_h = sc(22)

        d.rounded_rectangle([x - bw, y - bh, x + bw, y + bh], 10,
                            fill=PANEL, outline=accent, width=4 if big else 3)
        # type strip
        d.rounded_rectangle([x - bw, y - bh, x + bw, y - bh + strip_h], 10, fill=accent)
        d.rectangle([x - bw, y - bh + strip_h - 9, x + bw, y - bh + strip_h], fill=accent)
        num = "".join(ch for ch in o.key if ch.isdigit())
        strip = bidi_num(short_of(o.type) + (f" #{num}" if num else ""))
        _center(d, (x, y - bh + strip_h / 2),
                strip, mf(12 if o.type == "factory" else 13, True), (26, 22, 18))

        if o.type == "factory":
            _center(d, (x, y + sc(4)),
                    t("ball_when", a=ALLOY_TIMES[0], b=ALLOY_TIMES[1]), mf(15, True), ACCENT)
            _center(d, (x, y + sc(26)), t("ball_sub"), mf(12), INK_DIM)
        else:
            _center(d, (x, y + sc(4)), f"+{meta['alliance_rate']:,}/min", mf(14, True), INK)
            _center(d, (x, y + sc(26)),
                    t("on_capture", v=f"{meta['alliance_initial']:,}"), mf(12), INK_FAINT)

        # name plate — team name gets a solid full-width header bar
        pl = g["plate"]
        if pl and cell and o.key == cell.objectives[0]:
            d.rounded_rectangle(pl, 9, fill=(34, 29, 24), outline=cell.color, width=3)
            d.rounded_rectangle([pl[0], pl[1], pl[2], pl[1] + PLATE_HEAD], 9, fill=cell.color)
            d.rectangle([pl[0], pl[1] + PLATE_HEAD - 9, pl[2], pl[1] + PLATE_HEAD],
                        fill=cell.color)
            _center(d, ((pl[0] + pl[2]) / 2, pl[1] + PLATE_HEAD / 2),
                    cell.name, mf(18, True), (24, 20, 16))
            ty = pl[1] + PLATE_HEAD + sc(5)
            lead = emphasised(cell)
            for i, p in enumerate(cell.players):
                bold = i in lead
                f = mnf(p.name, 14, bold)
                mk = mark_of(cell, i)
                if mk:
                    draw_mark(d, [pl[0] + sc(9), ty + sc(5),
                                  pl[0] + sc(20), ty + sc(16)], mk)
                d.text((pl[0] + sc(26), ty), _clip(d, p.name, f, sc(146)), font=f,
                       fill=INK if bold else INK_DIM)
                s = fmt_cp(p.cp)
                sw, _ = _tw(d, s, f)
                d.text((pl[2] - sc(12) - sw, ty), s, font=f,
                       fill=INK if bold else INK_DIM)
                ty += ROW_H
        elif pl and cell:
            d.rounded_rectangle(pl, 7, fill=cell.color)
            _center(d, ((pl[0] + pl[2]) / 2, (pl[1] + pl[3]) / 2),
                    cell.name, mf(15, True), (24, 20, 16))

    # --- connectors: a cell's paired buildings -----------------------------
    # Drawn last, over the markers, with a dark casing. The anchors already
    # keep them out of the boxes, but a bare line at this scale hugs the plate
    # borders and disappears into them — the casing separates the two.
    core = max(5, int(sc(6)))
    for c in lu.cells:
        for k1, k2 in zip(c.objectives, c.objectives[1:]):
            pts = elbow(geom[k1], geom[k2])
            d.line(pts, fill=(22, 19, 16), width=core + 6, joint="curve")
            d.line(pts, fill=c.color, width=core, joint="curve")

    # ---------------- right panel: cells ----------------
    d.rounded_rectangle([PX0, PY0, PX0 + PW, PY0 + PH], 14,
                        fill=PANEL, outline=PANEL_EDGE, width=2)

    # distribute whatever vertical slack is left as extra breathing room between
    # cards, so the panel ends flush with the map instead of trailing empty space
    cards_h = sum(30 + 21 * len(c.players) + 22 for c in lu.cells)
    slack = PH - (14 + 27 + 17 + 17 + 23 + cards_h + 7 * len(lu.cells) + 14)
    card_gap = 7 + max(0, min(26, slack // max(1, len(lu.cells))))

    y = PY0 + 14
    d.text((PX0 + 20, y), t("assign"), font=font(20, True), fill=ACCENT)
    y += 27
    d.text((PX0 + 20, y), t("cap_prio"), font=font(12, True), fill=INK_DIM)
    y += 17
    d.text((PX0 + 20, y), t("prio_top"), font=font(12, True), fill=INK)
    y += 17
    d.text((PX0 + 20, y), t("cap_order"), font=font(12, True), fill=INK_FAINT)
    y += 23

    for c in lu.cells:
        card_h = 30 + 21 * len(c.players) + 22
        d.rounded_rectangle([PX0 + 14, y, PX0 + PW - 14, y + card_h], 9,
                            fill=(48, 41, 34), outline=c.color, width=2)
        d.rectangle([PX0 + 14, y, PX0 + 21, y + card_h], fill=c.color)
        d.text((PX0 + 32, y + 7), c.name, font=font(17, True), fill=c.color)
        cp_s = fmt_cp(c.cp)
        tw, _ = _tw(d, cp_s, font(15, True))
        d.text((PX0 + PW - 28 - tw, y + 8), cp_s, font=font(15, True), fill=INK_DIM)

        d.text((PX0 + 32, y + 28), bidi_num(objs_label(c)), font=font(13), fill=INK_FAINT)

        yy = y + 47
        lead = emphasised(c)
        for i, p in enumerate(c.players):
            bold = i in lead
            f = name_font(p.name, 15, bold)
            mk = mark_of(c, i)
            if mk:
                draw_mark(d, [PX0 + 24, yy + 5, PX0 + 35, yy + 16], mk)
            d.text((PX0 + 42, yy), _clip(d, p.name, f, 320), font=f,
                   fill=INK if bold else INK_DIM)
            s = fmt_cp(p.cp)
            tw, _ = _tw(d, s, f)
            d.text((PX0 + PW - 28 - tw, yy), s, font=f, fill=INK if bold else INK_DIM)
            yy += 21
        y += card_h + card_gap

    # ---------------- bottom band ----------------
    BY = MY + MH + GAP
    LX = MARGIN + 26
    DIV = MARGIN + 900                       # clock | standing orders
    DIV2 = DIV + 456                         # standing orders | rules
    d.rounded_rectangle([MARGIN, BY, W - MARGIN, H - MARGIN], 14,
                        fill=PANEL, outline=PANEL_EDGE, width=2)
    for dx in (DIV, DIV2):
        d.line([dx, BY + 16, dx, H - MARGIN - 16], fill=PANEL_EDGE, width=1)

    # phase timeline
    d.text((LX, BY + 10), t("clock"), font=font(15, True), fill=ACCENT)
    tl_x0, tl_x1, tl_y = MARGIN + 44, MARGIN + 830, BY + 60
    d.line([tl_x0, tl_y, tl_x1, tl_y], fill=(88, 76, 62), width=5)

    events = [(0, t("ev_start"), INK_FAINT)]
    if SUB_ENTRY_MIN is not None:
        events.append((SUB_ENTRY_MIN, t("ev_subs"), SUBIN))
    if CONTEST_UNLOCK_MIN is not None:
        events.append((CONTEST_UNLOCK_MIN, t("ev_open"), UNLOCK))
    events += [(ALLOY_TIMES[0], t("ev_ball", i=1), ACCENT),
               (ALLOY_TIMES[1], t("ev_ball", i=2), ACCENT)]
    events.append((BATTLE_MINUTES, t("ev_end"), INK_FAINT))

    for minute, lbl, col in events:
        mx = tl_x0 + (tl_x1 - tl_x0) * minute / BATTLE_MINUTES
        d.ellipse([mx - 7, tl_y - 7, mx + 7, tl_y + 7], fill=col)
        _center(d, (mx, tl_y - 20), f"{minute}:00", font(13, True), col)
        _center(d, (mx, tl_y + 20), lbl, font(12), col)

    def clock_line(yy, head, head_col, rest, rest_col, bold=False):
        d.text((LX, yy), head, font=font(14, True), fill=head_col)
        d.text((LX + 130, yy), rest, font=font(14, True if bold else False), fill=rest_col)

    ty = BY + 98
    unlock = CONTEST_UNLOCK_MIN if CONTEST_UNLOCK_MIN is not None else ALLOY_TIMES[0]
    clock_line(ty, f"0 - {unlock}", INK_DIM, t("l_ref"), INK_DIM)
    ty += 20
    if SUB_ENTRY_MIN is not None:
        clock_line(ty, f"{SUB_ENTRY_MIN}:00", SUBIN, t("l_subs"), SUBIN)
        ty += 20
    if CONTEST_UNLOCK_MIN is not None:
        clock_line(ty, f"{CONTEST_UNLOCK_MIN}:00", UNLOCK, t("l_open"), UNLOCK)
        ty += 20
    clock_line(ty, f"{ALLOY_TIMES[0]}:00", INK, t("l_ball"), INK, bold=True)
    ty += 20
    clock_line(ty, f"{ALLOY_TIMES[1]}:00", INK, t("l_ball2"), INK, bold=True)
    ty += 20
    clock_line(ty, f"{ALLOY_TIMES[1]} - {BATTLE_MINUTES}", ACCENT,
               t("l_tail"), ACCENT, bold=True)
    ty += 20
    d.text((LX, ty), t("l_warn"), font=font(13), fill=INK_DIM)

    for i, w in enumerate(lu.warnings[:2]):
        d.text((LX, ty + 24 + i * 18), f"!  {_clip(d, w, font(13), DIV - LX - 30)}",
               font=font(13), fill=(230, 140, 118))

    # standing orders (per mini-team)
    lx, avail = DIV + 26, DIV2 - (DIV + 26) - 22
    d.text((lx, BY + 14), t("orders"), font=font(15, True), fill=ACCENT)
    ly = BY + 40
    for c in lu.cells:
        d.rectangle([lx, ly + 4, lx + 9, ly + 13], fill=c.color)
        d.text((lx + 20, ly), _clip(d, bidi_num(c.brief), font(12), avail - 20),
               font=font(12), fill=INK_DIM)
        ly += ORDER_ROW

    ly += 8
    for kind, col, key in (("ball", MARK_BALL, "mark_ball"),
                           ("anchor", MARK_ANCHOR, "mark_anch")):
        draw_mark(d, [lx + 1, ly + 3, lx + 12, ly + 14], kind)
        d.text((lx + 20, ly), _clip(d, t(key), font(12), avail - 20),
               font=font(12), fill=col)
        ly += 17

    # rules of engagement (whole-team doctrine)
    rx, ravail = DIV2 + 26, (W - MARGIN) - (DIV2 + 26) - 22
    d.text((rx, BY + 14), t("rules"), font=font(15, True), fill=ACCENT)
    ry = BY + 40
    for k in RULE_KEYS:
        emph = k == "r5"
        d.text((rx, ry), "•", font=font(12, True), fill=ACCENT if emph else INK_FAINT)
        d.text((rx + 16, ry), _clip(d, t(k), font(12, emph), ravail - 16),
               font=font(12, emph), fill=ACCENT if emph else INK_DIM)
        ry += RULE_ROW
    d.text((rx, ry + 10), _clip(d, t("per"), font(13, True), ravail),
           font=font(13, True), fill=ACCENT)

    # Named explicitly: `out_path` is a BytesIO when the API is rendering, and
    # Pillow can only infer the format from a filename.
    img.save(out_path, format="PNG")
    return out_path
