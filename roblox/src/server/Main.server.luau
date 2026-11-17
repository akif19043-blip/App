-- Bozkır Harekâtı — sunucu girişi.
-- Haritayı kurar, modülleri başlatır, oyuncuları karşılar ve tur döngüsünü çalıştırır.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Ranks = require(Shared.Ranks)

local Bots = require(script.Parent.Bots)
local Combat = require(script.Parent.Combat)
local Entities = require(script.Parent.Entities)
local MapBuilder = require(script.Parent.MapBuilder)
local PlayerData = require(script.Parent.PlayerData)
local Round = require(script.Parent.Round)
local Spawner = require(script.Parent.Spawner)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")

Entities.init()
local mapData = MapBuilder.build(workspace)
Spawner.setMap(mapData)
Combat.init(mapData)
Bots.init(mapData)
Round.init(mapData)

local function onPlayerAdded(player)
	local profile = PlayerData.load(player)
	if not player.Parent then
		PlayerData.release(player)
		return
	end

	local teamId = Round.assignTeam(player)
	local entity = Entities.create({ name = player.DisplayName, player = player, team = teamId })
	entity.loadout = profile.loadout

	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local kills = Instance.new("IntValue")
	kills.Name = "Leş"
	kills.Parent = stats
	local deaths = Instance.new("IntValue")
	deaths.Name = "Ölüm"
	deaths.Parent = stats
	stats.Parent = player

	player:SetAttribute("Rank", Ranks.fromXp(profile.xp))
	Remotes.Profile:FireClient(player, PlayerData.public(player))
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	local entity = Entities.byPlayer[player]
	if entity then
		Spawner.despawn(entity)
		Entities.remove(entity)
	end
	PlayerData.release(player)
end)

-- İstemci hazır olduğunda profilini ister
Remotes.Profile.OnServerEvent:Connect(function(player)
	if PlayerData.get(player) then
		Remotes.Profile:FireClient(player, PlayerData.public(player))
	end
end)

task.spawn(function()
	while true do
		task.wait(Config.AutosaveInterval)
		PlayerData.saveAll()
	end
end)

game:BindToClose(function()
	PlayerData.saveAll()
end)

task.spawn(Round.run)
