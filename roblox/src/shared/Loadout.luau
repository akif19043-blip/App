-- Teçhizat doğrulama: oyuncunun istediği silah ve eklentiler gerçekten açık mı?
-- Sunucu, istemciden gelen isteği buradan geçirir; istemci menüde kilitleri
-- göstermek için aynı fonksiyonları kullanır.

local Attachments = require(script.Parent.Attachments)
local Ranks = require(script.Parent.Ranks)
local Weapons = require(script.Parent.Weapons)

local Loadout = {}

Loadout.Default = { primary = "bora", secondary = "akrep", attachments = {} }

function Loadout.weaponUnlocked(profile, weaponId)
	local def = Weapons.Defs[weaponId]
	return def ~= nil and Ranks.fromXp(profile.xp or 0) >= def.unlockRank
end

function Loadout.attachmentUnlocked(profile, weaponId, attachmentId)
	local def = Weapons.Defs[weaponId]
	local att = Attachments.Defs[attachmentId]
	if not def or not att or not Attachments.fits(def, attachmentId) then
		return false
	end
	local kills = profile.weaponKills and profile.weaponKills[weaponId] or 0
	return kills >= att.unlockKills
end

local function pick(profile, requested, list, fallback)
	if type(requested) == "string" and table.find(list, requested) and Loadout.weaponUnlocked(profile, requested) then
		return requested
	end
	return fallback
end

-- İstenen teçhizattan geçerli olanı üretir; geçersiz her şey atılır.
function Loadout.sanitize(profile, requested)
	if type(requested) ~= "table" then
		requested = {}
	end
	local result = {
		primary = pick(profile, requested.primary, Weapons.Primaries, Loadout.Default.primary),
		secondary = pick(profile, requested.secondary, Weapons.Secondaries, Loadout.Default.secondary),
		attachments = {},
	}
	local wanted = type(requested.attachments) == "table" and requested.attachments or {}
	for weaponId, slots in pairs(wanted) do
		if
			type(weaponId) == "string"
			and type(slots) == "table"
			and Weapons.Defs[weaponId]
			and not Weapons.Defs[weaponId].melee
		then
			local clean = {}
			local any = false
			for _, slot in ipairs(Attachments.Slots) do
				local attId = slots[slot]
				local att = type(attId) == "string" and Attachments.Defs[attId] or nil
				if att and att.slot == slot and Loadout.attachmentUnlocked(profile, weaponId, attId) then
					clean[slot] = attId
					any = true
				end
			end
			if any then
				result.attachments[weaponId] = clean
			end
		end
	end
	return result
end

return Loadout
