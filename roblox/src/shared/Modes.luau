-- Oyun modları. Turlar bu sırayla döner.

local Modes = {}

Modes.Order = { "tdm", "dom", "gg" }

Modes.Defs = {
	tdm = {
		id = "tdm",
		name = "Takım Ölüm Maçı",
		short = "TÖM",
		description = "Hedef leş sayısına ilk ulaşan takım kazanır.",
		duration = 480,
		target = 50,
		ffa = false,
	},
	dom = {
		id = "dom",
		name = "Bölge Hakimiyeti",
		short = "BÖLGE",
		description = "A, B ve C bölgelerini ele geçir ve tut. Tutulan her bölge puan kazandırır.",
		duration = 540,
		target = 150,
		ffa = false,
	},
	gg = {
		id = "gg",
		name = "Silah Yarışı",
		short = "YARIŞ",
		description = "Herkes tek başına. Her leş bir sonraki silahı verir; son silah bıçak.",
		duration = 480,
		target = 0,
		ffa = true,
		tiers = {
			"kasirga",
			"bora",
			"yildirim",
			"poyraz",
			"balyoz",
			"firtina",
			"tunc",
			"dogan",
			"ari",
			"engerek",
			"akrep",
			"kama",
		},
	},
}

function Modes.get(id)
	return Modes.Defs[id]
end

return Modes
