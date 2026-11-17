-- Bütün silahlar. Sayılar hem sunucuda hem istemcide buradan okunur; bu yüzden
-- bir silahı dengelemek için tek değiştirilecek yer burası.
--
-- damage / minDamage : yakın ve uzak mesafe hasarı (can 100)
-- falloffStart/End   : hasarın düşmeye başladığı ve en düşüğe indiği mesafe
-- rpm                : dakikadaki atış sayısı
-- recoilV / recoilH  : atış başına dikey / yatay tepme (derece)
-- hipSpread/adsSpread: nişan almadan / nişan alarak dağılma (derece)
-- bloom              : her atışta eklenen dağılma, maxBloom üst sınırı
-- adsFov             : nişan alınca görüş açısı (küçük = daha çok yakınlaştırma)

local Attachments = require(script.Parent.Attachments)

local Weapons = {}

Weapons.Defs = {
	bora = {
		id = "bora",
		name = "Bora-5",
		class = "AR",
		classLabel = "Piyade Tüfeği",
		slot = "primary",
		unlockRank = 1,
		description = "Her mesafede iş gören dengeli tüfek.",
		damage = 28,
		minDamage = 19,
		falloffStart = 60,
		falloffEnd = 170,
		headMult = 1.5,
		limbMult = 0.9,
		rpm = 650,
		fireMode = "auto",
		magSize = 30,
		reserve = 120,
		reloadTime = 2.3,
		adsTime = 0.22,
		adsFov = 52,
		hipSpread = 2.6,
		adsSpread = 0.15,
		bloom = 0.32,
		maxBloom = 2.4,
		recoilV = 1.05,
		recoilH = 0.42,
		range = 700,
		speedMult = 1,
		pellets = 1,
		sound = "rifle",
		model = {
			style = "rifle",
			length = 3.3,
			color = Color3.fromRGB(58, 62, 58),
			accent = Color3.fromRGB(96, 104, 84),
		},
	},
	kasirga = {
		id = "kasirga",
		name = "Kasırga-9",
		class = "SMG",
		classLabel = "Hafif Makineli",
		slot = "primary",
		unlockRank = 1,
		description = "Yakın mesafede çok hızlı, uzakta zayıf.",
		damage = 22,
		minDamage = 12,
		falloffStart = 28,
		falloffEnd = 95,
		headMult = 1.4,
		limbMult = 0.9,
		rpm = 900,
		fireMode = "auto",
		magSize = 32,
		reserve = 128,
		reloadTime = 1.9,
		adsTime = 0.16,
		adsFov = 60,
		hipSpread = 2.0,
		adsSpread = 0.4,
		bloom = 0.22,
		maxBloom = 2.0,
		recoilV = 0.78,
		recoilH = 0.55,
		range = 450,
		speedMult = 1.06,
		pellets = 1,
		sound = "smg",
		model = { style = "smg", length = 2.3, color = Color3.fromRGB(44, 46, 50), accent = Color3.fromRGB(70, 72, 78) },
	},
	tunc = {
		id = "tunc",
		name = "Tunç-M",
		class = "DMR",
		classLabel = "Nişancı Tüfeği",
		slot = "primary",
		unlockRank = 3,
		description = "Yarı otomatik, iki-üç isabetle indirir.",
		damage = 48,
		minDamage = 38,
		falloffStart = 120,
		falloffEnd = 320,
		headMult = 1.8,
		limbMult = 0.9,
		rpm = 300,
		fireMode = "semi",
		magSize = 15,
		reserve = 60,
		reloadTime = 2.6,
		adsTime = 0.28,
		adsFov = 34,
		hipSpread = 4.2,
		adsSpread = 0.05,
		bloom = 0.9,
		maxBloom = 3.5,
		recoilV = 2.2,
		recoilH = 0.5,
		range = 900,
		speedMult = 0.97,
		pellets = 1,
		sound = "dmr",
		model = { style = "dmr", length = 3.8, color = Color3.fromRGB(72, 60, 44), accent = Color3.fromRGB(46, 46, 46) },
	},
	dogan = {
		id = "dogan",
		name = "Doğan-S",
		class = "Sniper",
		classLabel = "Keskin Nişancı",
		slot = "primary",
		unlockRank = 4,
		description = "Sürgülü. Gövdeden tek atışa yakın, kafadan kesin.",
		damage = 92,
		minDamage = 80,
		falloffStart = 250,
		falloffEnd = 600,
		headMult = 2.5,
		limbMult = 0.85,
		rpm = 46,
		fireMode = "semi",
		magSize = 5,
		reserve = 30,
		reloadTime = 3.2,
		adsTime = 0.38,
		adsFov = 16,
		scope = true,
		hipSpread = 7,
		adsSpread = 0,
		bloom = 0,
		maxBloom = 0,
		recoilV = 5.2,
		recoilH = 0.9,
		range = 1400,
		speedMult = 0.93,
		pellets = 1,
		sound = "sniper",
		model = {
			style = "sniper",
			length = 4.4,
			color = Color3.fromRGB(64, 70, 54),
			accent = Color3.fromRGB(36, 36, 36),
		},
	},
	balyoz = {
		id = "balyoz",
		name = "Balyoz-12",
		class = "Shotgun",
		classLabel = "Pompalı",
		slot = "primary",
		unlockRank = 5,
		description = "Sekiz saçma. Kapı ağzında rakipsiz.",
		damage = 15,
		minDamage = 4,
		falloffStart = 16,
		falloffEnd = 60,
		headMult = 1.25,
		limbMult = 0.9,
		rpm = 78,
		fireMode = "semi",
		magSize = 6,
		reserve = 30,
		reloadTime = 3.0,
		adsTime = 0.24,
		adsFov = 62,
		hipSpread = 4.4,
		adsSpread = 3.4,
		bloom = 0,
		maxBloom = 0,
		recoilV = 4.6,
		recoilH = 1.4,
		range = 220,
		speedMult = 0.98,
		pellets = 8,
		sound = "shotgun",
		model = {
			style = "shotgun",
			length = 3.4,
			color = Color3.fromRGB(40, 40, 42),
			accent = Color3.fromRGB(98, 66, 40),
		},
	},
	firtina = {
		id = "firtina",
		name = "Fırtına-M",
		class = "LMG",
		classLabel = "Makineli Tüfek",
		slot = "primary",
		unlockRank = 7,
		description = "Seksenlik şerit. Ağır ama bastırır.",
		damage = 30,
		minDamage = 22,
		falloffStart = 70,
		falloffEnd = 210,
		headMult = 1.5,
		limbMult = 0.9,
		rpm = 600,
		fireMode = "auto",
		magSize = 80,
		reserve = 160,
		reloadTime = 4.6,
		adsTime = 0.36,
		adsFov = 52,
		hipSpread = 4.4,
		adsSpread = 0.3,
		bloom = 0.2,
		maxBloom = 2.2,
		recoilV = 0.95,
		recoilH = 0.7,
		range = 800,
		speedMult = 0.9,
		pellets = 1,
		sound = "lmg",
		model = { style = "lmg", length = 3.9, color = Color3.fromRGB(52, 54, 48), accent = Color3.fromRGB(86, 90, 70) },
	},
	yildirim = {
		id = "yildirim",
		name = "Yıldırım-K",
		class = "AR",
		classLabel = "Piyade Tüfeği",
		slot = "primary",
		unlockRank = 9,
		description = "Kısa namlulu, çok seri. Tepmesi sert.",
		damage = 24,
		minDamage = 17,
		falloffStart = 45,
		falloffEnd = 140,
		headMult = 1.5,
		limbMult = 0.9,
		rpm = 820,
		fireMode = "auto",
		magSize = 30,
		reserve = 120,
		reloadTime = 2.1,
		adsTime = 0.2,
		adsFov = 54,
		hipSpread = 2.4,
		adsSpread = 0.22,
		bloom = 0.3,
		maxBloom = 2.6,
		recoilV = 1.2,
		recoilH = 0.72,
		range = 600,
		speedMult = 1.02,
		pellets = 1,
		sound = "rifle",
		model = {
			style = "carbine",
			length = 2.8,
			color = Color3.fromRGB(48, 48, 50),
			accent = Color3.fromRGB(120, 100, 70),
		},
	},
	poyraz = {
		id = "poyraz",
		name = "Poyraz-3",
		class = "AR",
		classLabel = "Piyade Tüfeği",
		slot = "primary",
		unlockRank = 11,
		description = "Üçlü atış. Üçü de isabet ederse iş biter.",
		damage = 34,
		minDamage = 25,
		falloffStart = 75,
		falloffEnd = 200,
		headMult = 1.5,
		limbMult = 0.9,
		rpm = 900,
		fireMode = "burst",
		burstCount = 3,
		burstDelay = 0.24,
		magSize = 30,
		reserve = 120,
		reloadTime = 2.4,
		adsTime = 0.24,
		adsFov = 48,
		hipSpread = 3.0,
		adsSpread = 0.1,
		bloom = 0.25,
		maxBloom = 2.0,
		recoilV = 0.85,
		recoilH = 0.3,
		range = 800,
		speedMult = 0.99,
		pellets = 1,
		sound = "rifle",
		model = {
			style = "rifle",
			length = 3.5,
			color = Color3.fromRGB(70, 76, 66),
			accent = Color3.fromRGB(40, 40, 40),
		},
	},

	akrep = {
		id = "akrep",
		name = "Akrep-9",
		class = "Pistol",
		classLabel = "Tabanca",
		slot = "secondary",
		unlockRank = 1,
		description = "Güvenilir yan silah.",
		damage = 26,
		minDamage = 15,
		falloffStart = 25,
		falloffEnd = 75,
		headMult = 1.5,
		limbMult = 0.9,
		rpm = 400,
		fireMode = "semi",
		magSize = 15,
		reserve = 60,
		reloadTime = 1.5,
		adsTime = 0.13,
		adsFov = 64,
		hipSpread = 1.8,
		adsSpread = 0.3,
		bloom = 0.5,
		maxBloom = 2.2,
		recoilV = 1.3,
		recoilH = 0.4,
		range = 350,
		speedMult = 1.08,
		pellets = 1,
		sound = "pistol",
		model = {
			style = "pistol",
			length = 1.1,
			color = Color3.fromRGB(42, 42, 44),
			accent = Color3.fromRGB(70, 70, 72),
		},
	},
	engerek = {
		id = "engerek",
		name = "Engerek-50",
		class = "Pistol",
		classLabel = "Ağır Tabanca",
		slot = "secondary",
		unlockRank = 6,
		description = "Yedi mermi, her biri tokat gibi.",
		damage = 52,
		minDamage = 30,
		falloffStart = 30,
		falloffEnd = 95,
		headMult = 2,
		limbMult = 0.9,
		rpm = 170,
		fireMode = "semi",
		magSize = 7,
		reserve = 35,
		reloadTime = 1.9,
		adsTime = 0.17,
		adsFov = 62,
		hipSpread = 2.4,
		adsSpread = 0.15,
		bloom = 1.2,
		maxBloom = 3,
		recoilV = 3.4,
		recoilH = 0.8,
		range = 400,
		speedMult = 1.05,
		pellets = 1,
		sound = "heavy",
		model = {
			style = "pistol",
			length = 1.35,
			color = Color3.fromRGB(150, 150, 156),
			accent = Color3.fromRGB(44, 40, 38),
		},
	},
	ari = {
		id = "ari",
		name = "Arı-7",
		class = "Pistol",
		classLabel = "Makineli Tabanca",
		slot = "secondary",
		unlockRank = 10,
		description = "Tam otomatik. Şarjör göz açıp kapayana kadar biter.",
		damage = 19,
		minDamage = 11,
		falloffStart = 18,
		falloffEnd = 60,
		headMult = 1.4,
		limbMult = 0.9,
		rpm = 1000,
		fireMode = "auto",
		magSize = 20,
		reserve = 80,
		reloadTime = 1.6,
		adsTime = 0.14,
		adsFov = 64,
		hipSpread = 2.4,
		adsSpread = 0.7,
		bloom = 0.3,
		maxBloom = 2.6,
		recoilV = 1.0,
		recoilH = 0.8,
		range = 300,
		speedMult = 1.07,
		pellets = 1,
		sound = "smg",
		model = {
			style = "pistol",
			length = 1.25,
			color = Color3.fromRGB(56, 56, 48),
			accent = Color3.fromRGB(30, 30, 30),
		},
	},

	kama = {
		id = "kama",
		name = "Kama",
		class = "Melee",
		classLabel = "Bıçak",
		slot = "melee",
		unlockRank = 1,
		description = "Sessiz ve kesin.",
		melee = true,
		damage = 100,
		minDamage = 100,
		falloffStart = 0,
		falloffEnd = 1,
		headMult = 1,
		limbMult = 1,
		rpm = 100,
		fireMode = "semi",
		magSize = 0,
		reserve = 0,
		reloadTime = 0,
		adsTime = 0.1,
		adsFov = 80,
		hipSpread = 0,
		adsSpread = 0,
		bloom = 0,
		maxBloom = 0,
		recoilV = 0,
		recoilH = 0,
		range = 8.5,
		speedMult = 1.12,
		pellets = 1,
		sound = "knife",
		model = {
			style = "knife",
			length = 1.2,
			color = Color3.fromRGB(170, 174, 178),
			accent = Color3.fromRGB(36, 36, 36),
		},
	},
}

Weapons.Primaries = { "bora", "kasirga", "tunc", "dogan", "balyoz", "firtina", "yildirim", "poyraz" }
Weapons.Secondaries = { "akrep", "engerek", "ari" }
Weapons.Melee = "kama"

function Weapons.get(id)
	return Weapons.Defs[id]
end

-- Silahın takılı eklentilerle birlikte gerçek değerlerini üretir. Sunucu da
-- istemci de bunu çağırır, böylece iki taraf aynı sayılarla çalışır.
function Weapons.resolve(id, attachmentIds)
	local def = Weapons.Defs[id]
	if not def then
		return nil
	end
	local stats = table.clone(def)
	stats.attachments = {}
	stats.suppressed = false
	if attachmentIds then
		for _, slot in ipairs(Attachments.Slots) do
			local attId = attachmentIds[slot]
			local att = attId and Attachments.Defs[attId]
			if att and att.slot == slot and Attachments.fits(def, attId) then
				stats.attachments[slot] = attId
				local m = att.mods
				if m.recoilV then
					stats.recoilV *= m.recoilV
				end
				if m.recoilH then
					stats.recoilH *= m.recoilH
				end
				if m.hipSpread then
					stats.hipSpread *= m.hipSpread
				end
				if m.adsSpread then
					stats.adsSpread *= m.adsSpread
				end
				if m.adsTime then
					stats.adsTime *= m.adsTime
				end
				if m.reloadTime then
					stats.reloadTime *= m.reloadTime
				end
				if m.range then
					stats.falloffStart *= m.range
					stats.falloffEnd *= m.range
				end
				if m.magSize then
					stats.magSize = math.floor(stats.magSize * m.magSize + 0.5)
				end
				if m.speed then
					stats.speedMult *= m.speed
				end
				if m.adsFov then
					stats.adsFov = m.adsFov
				end
				if m.scope then
					stats.scope = true
				end
				if m.suppressed then
					stats.suppressed = true
				end
			end
		end
	end
	return stats
end

return Weapons
