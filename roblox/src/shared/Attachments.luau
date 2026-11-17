-- Eklentiler. Her biri o silahla alınan leş sayısıyla açılır (unlockKills) ve
-- bir şey kazandırırken bir şey götürür.

local Attachments = {}

Attachments.Slots = { "sight", "barrel", "grip", "mag" }
Attachments.SlotNames = { sight = "Nişangâh", barrel = "Namlu", grip = "Kabza", mag = "Şarjör" }

Attachments.Defs = {
	reddot = {
		id = "reddot",
		slot = "sight",
		name = "Kırmızı Nokta",
		unlockKills = 5,
		info = "Açık görüş, biraz daha hızlı nişan.",
		mods = { adsTime = 0.95 },
	},
	holo = {
		id = "holo",
		slot = "sight",
		name = "Holografik",
		unlockKills = 20,
		info = "Geniş çerçeve, hafif yakınlaştırma.",
		mods = { adsFov = 46 },
	},
	scope4 = {
		id = "scope4",
		slot = "sight",
		name = "4x Dürbün",
		unlockKills = 40,
		info = "Uzak hedef için. Nişan alma yavaşlar.",
		mods = { adsFov = 24, adsTime = 1.18 },
	},

	suppressor = {
		id = "suppressor",
		slot = "barrel",
		name = "Susturucu",
		unlockKills = 15,
		info = "Radarda görünmezsin. Menzil %15 düşer.",
		mods = { suppressed = true, range = 0.85, recoilV = 0.95 },
	},
	compensator = {
		id = "compensator",
		slot = "barrel",
		name = "Kompansatör",
		unlockKills = 30,
		info = "Dikey tepme %18 az, yatay tepme biraz fazla.",
		mods = { recoilV = 0.82, recoilH = 1.1 },
	},
	longbarrel = {
		id = "longbarrel",
		slot = "barrel",
		name = "Uzun Namlu",
		unlockKills = 60,
		info = "Menzil %20 artar, nişan alma yavaşlar.",
		mods = { range = 1.2, adsTime = 1.1 },
	},

	vgrip = {
		id = "vgrip",
		slot = "grip",
		name = "Dikey Kabza",
		unlockKills = 10,
		info = "Dikey tepme %12 az.",
		mods = { recoilV = 0.88, adsTime = 1.06 },
	},
	agrip = {
		id = "agrip",
		slot = "grip",
		name = "Açılı Kabza",
		unlockKills = 25,
		info = "Nişan alma %15 hızlı.",
		mods = { adsTime = 0.85, recoilH = 1.06 },
	},
	laser = {
		id = "laser",
		slot = "grip",
		name = "Lazer",
		unlockKills = 45,
		info = "Nişan almadan dağılma %30 az.",
		mods = { hipSpread = 0.7 },
	},

	extmag = {
		id = "extmag",
		slot = "mag",
		name = "Uzatılmış Şarjör",
		unlockKills = 20,
		info = "Üçte bir daha fazla mermi, dolum yavaşlar.",
		mods = { magSize = 1.34, reloadTime = 1.12 },
	},
	fastmag = {
		id = "fastmag",
		slot = "mag",
		name = "Hızlı Şarjör",
		unlockKills = 35,
		info = "Dolum %20 hızlı.",
		mods = { reloadTime = 0.8 },
	},
}

Attachments.BySlot = {
	sight = { "reddot", "holo", "scope4" },
	barrel = { "suppressor", "compensator", "longbarrel" },
	grip = { "vgrip", "agrip", "laser" },
	mag = { "extmag", "fastmag" },
}

-- Hangi sınıf hangi eklentiyi takabilir
local allowed = {
	AR = {
		reddot = true,
		holo = true,
		scope4 = true,
		suppressor = true,
		compensator = true,
		longbarrel = true,
		vgrip = true,
		agrip = true,
		laser = true,
		extmag = true,
		fastmag = true,
	},
	SMG = {
		reddot = true,
		holo = true,
		suppressor = true,
		compensator = true,
		vgrip = true,
		agrip = true,
		laser = true,
		extmag = true,
		fastmag = true,
	},
	LMG = {
		reddot = true,
		holo = true,
		scope4 = true,
		compensator = true,
		longbarrel = true,
		vgrip = true,
		agrip = true,
		extmag = true,
	},
	DMR = {
		reddot = true,
		holo = true,
		scope4 = true,
		suppressor = true,
		compensator = true,
		longbarrel = true,
		vgrip = true,
		agrip = true,
		extmag = true,
		fastmag = true,
	},
	Sniper = { suppressor = true, longbarrel = true, extmag = true, fastmag = true },
	Shotgun = { reddot = true, holo = true, longbarrel = true, laser = true, extmag = true },
	Pistol = { reddot = true, suppressor = true, laser = true, extmag = true, fastmag = true },
	Melee = {},
}

function Attachments.fits(weaponDef, attachmentId)
	local set = allowed[weaponDef.class]
	return set ~= nil and set[attachmentId] == true
end

function Attachments.optionsFor(weaponDef, slot)
	local list = {}
	for _, id in ipairs(Attachments.BySlot[slot]) do
		if Attachments.fits(weaponDef, id) then
			table.insert(list, id)
		end
	end
	return list
end

return Attachments
