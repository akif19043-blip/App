#!/usr/bin/env python3
"""Kaynaktaki Roblox adlarını resmi API listesine (API-Dump.json) karşı denetler.

Büyük harfle başlayan her alan, yöntem ve özellik adı (".Foo", ":Foo(",
tablo içinde "Foo =") ya API listesinde bir sınıf üyesi, ya bir Enum adı, ya
bir veri türü üyesi (Vector3.X gibi) ya da bizim verdiğimiz bir nesne adı
olmalı. Yazım hatalarını (BackgroundTransparancy gibi) Studio'ya girmeden
yakalar.

Kullanım: python3 tools/check_api.py API-Dump.json src
"""
import json
import os
import re
import sys

dump_path, *roots = sys.argv[1:]
dump = json.load(open(dump_path))

known = set()
for cls in dump["Classes"]:
    known.add(cls["Name"])
    for member in cls["Members"]:
        known.add(member["Name"])
for enum in dump["Enums"]:
    known.add(enum["Name"])
    for item in enum["Items"]:
        known.add(item["Name"])

# Veri türlerinin (Vector3, CFrame, Color3, UDim2...) üyeleri ve Luau kütüphaneleri
DATATYPE = """
X Y Z Magnitude Unit Position LookVector RightVector UpVector Rotation Lerp Dot Cross
Angles new fromRGB fromHSV fromHex fromScale fromOffset lookAt fromEulerAnglesXYZ
fromEulerAnglesYXZ fromOrientation fromMatrix Inverse ToWorldSpace ToObjectSpace
PointToWorldSpace PointToObjectSpace VectorToWorldSpace VectorToObjectSpace R G B
Scale Offset Width Height Min Max Keypoints Time Value Envelope Instance Normal
Material Distance Abs FuzzyEq Floor Ceil Sign Angle zero one xAxis yAxis zAxis
identity Name Color Size ToHex ToHSV Status Action Label XVector YVector ZVector
Connect Once Wait Disconnect Connected NextNumber NextInteger NextUnitVector Shuffle
IgnoreWater FilterDescendantsInstances FilterType CollisionGroup RespectCanCollide
AgentRadius AgentHeight AgentCanJump AgentCanClimb WaypointSpacing Costs
""".split()

# Bizim koyduğumuz nesne ve öznitelik adları
OURS = """
Shared State Remotes Server Client Points Map Scoreboard Projectiles Effects
Deploy SetLoadout Fire Reload Equip Melee Grenade Look Spawned Profile ShotFx
HitConfirm Damaged KillFeed Notify Died Blast Health HumanoidRootPart Head
UpperTorso LowerTorso Torso RightHand LeftHand RightUpperArm LeftUpperArm
RightShoulder LeftShoulder Waist Helmet Vest WorldGun Muzzle Aim Handle Zone Pole
Flag Canvas Root TeamTag Viewmodel Mag Dot Sahin Ejder Kills Deaths Assists Score
Tier Alive Bot UserId Team TeamId Rank Weapon Suppressed AimPitch EntityName Letter
Owner Progress CapTeam Contested Phase Mode ModeName ModeInfo Target FFA Weather
Winner WinnerName LeaderName LeaderTier TimeLeft ScoreSahin ScoreEjder DX DY
Hesco Barrier Crate Container Truck Rock Trunk Leaves Bush Ridge Boundary Wall Floor
Roof Slab Ramp Landing Ladder Tent FuelTank Sandbags Grip Line Glass Top Bottom
Left Right Crosshair Hitmarker Scope HealthPanel AmmoPanel Vignette Popups Announce
Banner DamageIndicators Radar Weapons Detail Side GunGameNote Result MouseUnlock
Hud Menu TouchControls A B C Config Ui Util Signal Sounds Weapons Attachments
Ranks Modes Ballistics Loadout GunModels Defs Primaries Secondaries Slots
SlotNames BySlot Colors Font FontMedium FontBlack DesignWidth DesignHeight Max Names
Order Teams TeamById Xp Lighting Default Order Health Death AR SMG LMG DMR Sniper
Shotgun Pistol
"""
ours = set(OURS.split())

# Kendi modül tablolarımıza atanan alanlar (Config.RespawnDelay = 3 gibi) da bizim adlarımızdır
MODULES = r"(?:Config|Signal|Combat|Entities|Spawner|Bots|Round|MapBuilder|PlayerData|Menu|Hud|Arsenal|Movement|Controls|Effects|Viewmodel|Scoreboard|Sfx|Ui|Util|Weapons|Attachments|Ranks|Modes|Ballistics|Loadout|GunModels|Sounds)"
defined = re.compile(r"\b" + MODULES + r"\.([A-Z][A-Za-z0-9_]*)\s*=(?!=)|\bfunction\s+" + MODULES + r"[.:]([A-Z][A-Za-z0-9_]*)")
for root in roots:
    for folder, _, files in os.walk(root):
        for name in files:
            if name.endswith(".luau"):
                for match in defined.finditer(open(os.path.join(folder, name), encoding="utf-8").read()):
                    ours.add(match.group(1) or match.group(2))

pattern = re.compile(r"(?:\.|:)([A-Z][A-Za-z0-9_]*)|\b([A-Z][A-Za-z0-9_]*)\s*=(?!=)")
problems = []
for root in roots:
    for folder, _, files in os.walk(root):
        for name in files:
            if not name.endswith(".luau"):
                continue
            path = os.path.join(folder, name)
            for number, line in enumerate(open(path, encoding="utf-8"), 1):
                code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', line.split("--")[0])
                for match in pattern.finditer(code):
                    word = match.group(1) or match.group(2)
                    if word in known or word in DATATYPE or word in ours:
                        continue
                    # Yerel değişken adları (ör. local Arsenal = ...) sorun değil
                    if re.search(r"\blocal\s+" + word + r"\b", code) or re.search(r"\bfunction\s+" + word, code):
                        continue
                    problems.append(f"{path}:{number}: bilinmeyen ad '{word}'")

for problem in problems:
    print(problem)
print(f"{len(problems)} şüpheli ad")
sys.exit(1 if problems else 0)
