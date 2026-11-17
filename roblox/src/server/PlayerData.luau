-- Oyuncu kaydı: puan, rütbe, silah başına leş, teçhizat. DataStore'a yazılır;
-- Studio'da API erişimi kapalıysa yalnızca bellekte tutulur ve oyun yine çalışır.

local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Loadout = require(Shared.Loadout)
local Ranks = require(Shared.Ranks)
local Weapons = require(Shared.Weapons)

local PlayerData = {}

local profiles = {}
local store

do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	if ok then
		store = result
	else
		warn("[Bozkır] DataStore kullanılamıyor, ilerleme bu oturumda kalacak:", result)
	end
end

local function defaults()
	return {
		xp = 0,
		kills = 0,
		deaths = 0,
		headshots = 0,
		wins = 0,
		matches = 0,
		weaponKills = {},
		loadout = { primary = Loadout.Default.primary, secondary = Loadout.Default.secondary, attachments = {} },
	}
end

local function key(player)
	return "oyuncu_" .. tostring(player.UserId)
end

function PlayerData.load(player)
	local profile = defaults()
	local canSave = false
	if store then
		local ok, result = pcall(function()
			return store:GetAsync(key(player))
		end)
		if ok then
			canSave = true
			if type(result) == "table" then
				for name, value in pairs(result) do
					if profile[name] ~= nil and type(value) == type(profile[name]) then
						profile[name] = value
					end
				end
			end
		else
			warn("[Bozkır] Kayıt okunamadı, bu oturum kaydedilmeyecek:", result)
		end
	end
	profile.loadout = Loadout.sanitize(profile, profile.loadout)
	profiles[player] = { data = profile, canSave = canSave, dirty = false }
	return profile
end

function PlayerData.get(player)
	local entry = profiles[player]
	return entry and entry.data or nil
end

function PlayerData.touch(player)
	local entry = profiles[player]
	if entry then
		entry.dirty = true
	end
end

function PlayerData.save(player)
	local entry = profiles[player]
	if not entry or not entry.canSave or not entry.dirty or not store then
		return
	end
	entry.dirty = false
	local ok, result = pcall(function()
		store:SetAsync(key(player), entry.data)
	end)
	if not ok then
		entry.dirty = true
		warn("[Bozkır] Kayıt yazılamadı:", result)
	end
end

function PlayerData.release(player)
	PlayerData.save(player)
	profiles[player] = nil
end

function PlayerData.saveAll()
	for player in pairs(profiles) do
		PlayerData.save(player)
	end
end

-- Puan ekler. Rütbe atlandıysa yeni rütbeyi ve açılan silahların adlarını döndürür.
function PlayerData.addXp(player, amount)
	local entry = profiles[player]
	if not entry then
		return nil
	end
	local data = entry.data
	local before = Ranks.fromXp(data.xp)
	data.xp += amount
	entry.dirty = true
	local after = Ranks.fromXp(data.xp)
	if after > before then
		local unlocked = {}
		for _, def in pairs(Weapons.Defs) do
			if def.unlockRank > before and def.unlockRank <= after then
				table.insert(unlocked, def.name)
			end
		end
		table.sort(unlocked)
		return after, unlocked
	end
	return nil
end

function PlayerData.addWeaponKill(player, weaponId)
	local entry = profiles[player]
	if not entry or not Weapons.Defs[weaponId] then
		return
	end
	local kills = entry.data.weaponKills
	kills[weaponId] = (kills[weaponId] or 0) + 1
	entry.dirty = true
end

function PlayerData.setLoadout(player, requested)
	local entry = profiles[player]
	if not entry then
		return nil
	end
	entry.data.loadout = Loadout.sanitize(entry.data, requested)
	entry.dirty = true
	return entry.data.loadout
end

-- İstemciye gönderilen özet
function PlayerData.public(player)
	local data = PlayerData.get(player)
	if not data then
		return nil
	end
	return {
		xp = data.xp,
		rank = Ranks.fromXp(data.xp),
		kills = data.kills,
		deaths = data.deaths,
		headshots = data.headshots,
		wins = data.wins,
		matches = data.matches,
		weaponKills = data.weaponKills,
		loadout = data.loadout,
	}
end

return PlayerData
