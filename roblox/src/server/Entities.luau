-- Savaşan herkesin (oyuncu ya da bot) kaydı. Diğer sunucu modülleri oyuncu ile
-- botu ayırmadan bu kayıtlar üzerinden çalışır.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Signal)
local Util = require(Shared.Util)

local Entities = {}

Entities.list = {}
Entities.byPlayer = {}
Entities.byCharacter = {}
Entities.ffa = false

-- (entity, character) : karakterin Humanoid'i öldüğünde
Entities.CharacterDied = Signal.new()

local nextId = 0
local scoreboard

function Entities.init()
	local state = ReplicatedStorage:WaitForChild("State")
	scoreboard = Instance.new("Folder")
	scoreboard.Name = "Scoreboard"
	scoreboard.Parent = state
end

function Entities.syncRow(entity)
	local row = entity.row
	if not row then
		return
	end
	row:SetAttribute("Team", entity.team)
	row:SetAttribute("Kills", entity.kills)
	row:SetAttribute("Deaths", entity.deaths)
	row:SetAttribute("Assists", entity.assists)
	row:SetAttribute("Score", entity.score)
	row:SetAttribute("Tier", entity.ggTier)
	row:SetAttribute("Alive", entity.alive)
	local player = entity.player
	if player then
		player:SetAttribute("Kills", entity.kills)
		player:SetAttribute("Deaths", entity.deaths)
		player:SetAttribute("Score", entity.score)
		player:SetAttribute("Tier", entity.ggTier)
		local stats = player:FindFirstChild("leaderstats")
		if stats then
			local kills = stats:FindFirstChild("Leş")
			local deaths = stats:FindFirstChild("Ölüm")
			if kills then
				kills.Value = entity.kills
			end
			if deaths then
				deaths.Value = entity.deaths
			end
		end
	end
end

function Entities.create(props)
	nextId += 1
	local entity = {
		id = nextId,
		name = props.name,
		isBot = props.isBot == true,
		player = props.player,
		team = props.team,
		character = nil,
		humanoid = nil,
		alive = false,
		kills = 0,
		deaths = 0,
		assists = 0,
		score = 0,
		streak = 0,
		ggTier = 1,
		loadout = nil,
		weapons = {},
		order = {},
		currentWeapon = nil,
		grenades = 0,
		lastDamageTime = 0,
		damagers = {},
		protectedUntil = 0,
		respawnAt = 0,
		lastKiller = nil,
	}

	local row = Instance.new("Configuration")
	row.Name = tostring(entity.id)
	row:SetAttribute("Name", entity.name)
	row:SetAttribute("Bot", entity.isBot)
	row:SetAttribute("UserId", props.player and props.player.UserId or 0)
	entity.row = row
	Entities.syncRow(entity)
	row.Parent = scoreboard

	table.insert(Entities.list, entity)
	if props.player then
		Entities.byPlayer[props.player] = entity
	end
	return entity
end

function Entities.clearCharacter(entity)
	if entity.character then
		Entities.byCharacter[entity.character] = nil
	end
	entity.character = nil
	entity.humanoid = nil
end

function Entities.setCharacter(entity, character, humanoid)
	Entities.clearCharacter(entity)
	entity.character = character
	entity.humanoid = humanoid
	Entities.byCharacter[character] = entity
end

function Entities.remove(entity)
	Entities.clearCharacter(entity)
	entity.alive = false
	entity.removed = true
	local index = table.find(Entities.list, entity)
	if index then
		table.remove(Entities.list, index)
	end
	if entity.player then
		Entities.byPlayer[entity.player] = nil
	end
	if entity.row then
		entity.row:Destroy()
		entity.row = nil
	end
end

function Entities.fromPart(part)
	local character = Util.characterFromPart(part)
	return character and Entities.byCharacter[character] or nil
end

function Entities.isEnemy(a, b)
	if a == b then
		return false
	end
	if Entities.ffa then
		return true
	end
	return a.team ~= b.team
end

function Entities.rootPart(entity)
	local character = entity.character
	return character and character:FindFirstChild("HumanoidRootPart") or nil
end

function Entities.position(entity)
	local root = Entities.rootPart(entity)
	return root and root.Position or nil
end

function Entities.headPosition(entity)
	local character = entity.character
	local head = character and character:FindFirstChild("Head")
	if head then
		return head.Position
	end
	local root = Entities.rootPart(entity)
	return root and root.Position + Vector3.new(0, 2, 0) or nil
end

function Entities.count(teamId, kind)
	local total = 0
	for _, entity in ipairs(Entities.list) do
		if (teamId == nil or entity.team == teamId) and (kind == nil or (kind == "bot") == entity.isBot) then
			total += 1
		end
	end
	return total
end

function Entities.resetStats()
	for _, entity in ipairs(Entities.list) do
		entity.kills = 0
		entity.deaths = 0
		entity.assists = 0
		entity.score = 0
		entity.streak = 0
		entity.ggTier = 1
		entity.lastKiller = nil
		entity.damagers = {}
		Entities.syncRow(entity)
	end
end

return Entities
