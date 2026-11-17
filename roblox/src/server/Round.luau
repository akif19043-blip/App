-- Tur yöneticisi: mod sırası, süre, skor, bölge ele geçirme, Silah Yarışı
-- seviyeleri, tur sonu ödülleri. Durumu ReplicatedStorage.State üzerindeki
-- özniteliklerle istemcilere duyurur.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Teams = game:GetService("Teams")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Modes = require(Shared.Modes)
local Util = require(Shared.Util)
local Weapons = require(Shared.Weapons)

local Bots = require(script.Parent.Bots)
local Combat = require(script.Parent.Combat)
local Entities = require(script.Parent.Entities)
local MapBuilder = require(script.Parent.MapBuilder)
local PlayerData = require(script.Parent.PlayerData)
local Spawner = require(script.Parent.Spawner)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local State = ReplicatedStorage:WaitForChild("State")

local Round = {}

local NEUTRAL = Color3.fromRGB(230, 230, 230)

local mapData
local teamObjects = {}
local rng = Random.new()
local phase = "Intermission"
local mode = Modes.Defs[Modes.Order[1]]
local scores = {}
local ggWinner = nil

local function setScore(teamId, value)
	scores[teamId] = value
	State:SetAttribute("Score" .. teamId, math.floor(value))
end

local function addScore(teamId, amount)
	setScore(teamId, (scores[teamId] or 0) + amount)
end

function Round.phase()
	return phase
end

-- Oyuncusu az olan takıma yerleştirir
function Round.assignTeam(player)
	local first, second = Config.Teams[1].id, Config.Teams[2].id
	local teamId = Entities.count(first, "player") <= Entities.count(second, "player") and first or second
	player.Team = teamObjects[teamId]
	player.Neutral = false
	player:SetAttribute("TeamId", teamId)
	return teamId
end

local function rebalance()
	local first, second = Config.Teams[1].id, Config.Teams[2].id
	for _ = 1, 8 do
		local a, b = Entities.count(first, "player"), Entities.count(second, "player")
		if math.abs(a - b) < 2 then
			return
		end
		local from, to = a > b and first or second, a > b and second or first
		for index = #Entities.list, 1, -1 do
			local entity = Entities.list[index]
			if entity.player and entity.team == from then
				entity.team = to
				entity.player.Team = teamObjects[to]
				entity.player:SetAttribute("TeamId", to)
				Entities.syncRow(entity)
				Remotes.Notify:FireClient(entity.player, {
					kind = "announce",
					text = "Takımlar dengelendi: " .. Config.TeamById[to].name .. " tarafındasın",
				})
				break
			end
		end
	end
end

-- Bölgeler -------------------------------------------------------------

local function paintPoint(point)
	local owner = point.owner
	local color = owner ~= "" and Config.TeamById[owner].color or NEUTRAL
	point.zone.Color = color
	point.flag.Color = color
	point.model:SetAttribute("Owner", owner)
end

local function resetPoints()
	for _, point in ipairs(mapData.points) do
		point.owner = ""
		point.progress = 0
		point.capTeam = ""
		point.model:SetAttribute("Progress", 0)
		point.model:SetAttribute("CapTeam", "")
		point.model:SetAttribute("Contested", false)
		paintPoint(point)
	end
end

local function captureStep(dt)
	local first, second = Config.Teams[1].id, Config.Teams[2].id
	for _, point in ipairs(mapData.points) do
		local present = { [first] = {}, [second] = {} }
		for _, entity in ipairs(Entities.list) do
			if entity.alive then
				local position = Entities.position(entity)
				if
					position
					and math.abs(position.Y - point.position.Y) < 14
					and Util.flat(position - point.position).Magnitude <= Config.CaptureRadius
				then
					table.insert(present[entity.team], entity)
				end
			end
		end
		local a, b = #present[first], #present[second]
		local contested = a > 0 and b > 0

		if not contested then
			if a + b == 0 then
				-- Kimse yok: yarım kalan ilerleme yavaşça söner
				point.progress = math.max(0, point.progress - dt / (Config.CaptureTime * 2))
			else
				local team = a > 0 and first or second
				local crowd = math.min(math.max(a, b), Config.CaptureMaxSpeed)
				local rate = (0.6 + 0.4 * crowd) / Config.CaptureTime
				if point.owner == team or (point.capTeam ~= "" and point.capTeam ~= team) then
					-- Sahibi geri geldi ya da rakibin ilerlemesi siliniyor
					point.progress = math.max(0, point.progress - rate * dt)
				else
					point.capTeam = team
					point.progress += rate * dt * (point.owner ~= "" and 1.6 or 1)
					if point.progress >= 1 then
						point.progress = 0
						point.capTeam = ""
						if point.owner ~= "" then
							point.owner = ""
							paintPoint(point)
							for _, entity in ipairs(present[team]) do
								Combat.award(entity, Config.Xp.neutralize, point.letter .. " etkisizleştirildi")
							end
						else
							point.owner = team
							paintPoint(point)
							for _, entity in ipairs(present[team]) do
								Combat.award(entity, Config.Xp.capture, point.letter .. " ele geçirildi")
							end
							Remotes.Notify:FireAllClients({
								kind = "capture",
								letter = point.letter,
								team = team,
								text = Config.TeamById[team].name .. " " .. point.letter .. " bölgesini aldı",
							})
						end
					end
				end
			end
			if point.progress <= 0 then
				point.capTeam = ""
			end
		end

		local shown = math.floor(point.progress * 20 + 0.5) / 20
		if point.model:GetAttribute("Progress") ~= shown then
			point.model:SetAttribute("Progress", shown)
		end
		if point.model:GetAttribute("CapTeam") ~= point.capTeam then
			point.model:SetAttribute("CapTeam", point.capTeam)
		end
		if point.model:GetAttribute("Contested") ~= contested then
			point.model:SetAttribute("Contested", contested)
		end
	end
end

-- Silah Yarışı -----------------------------------------------------------

local function updateLeader()
	local leader
	for _, entity in ipairs(Entities.list) do
		if
			not leader
			or entity.ggTier > leader.ggTier
			or (entity.ggTier == leader.ggTier and entity.kills > leader.kills)
		then
			leader = entity
		end
	end
	State:SetAttribute("LeaderName", leader and leader.name or "")
	State:SetAttribute("LeaderTier", leader and leader.ggTier or 1)
	return leader
end

local function onKill(info)
	if phase ~= "Playing" then
		return
	end
	local killer, victim = info.killer, info.victim
	if mode.id == "tdm" then
		if killer then
			addScore(killer.team, 1)
		end
	elseif mode.id == "gg" then
		local tiers = mode.tiers
		if killer then
			if info.melee and victim.ggTier > 1 and killer.ggTier < #tiers then
				victim.ggTier -= 1
				Entities.syncRow(victim)
				if victim.player then
					Remotes.Notify:FireClient(
						victim.player,
						{ kind = "announce", text = "Bıçaklandın: bir seviye geri düştün" }
					)
				end
			end
			if killer.ggTier >= #tiers then
				ggWinner = killer
			else
				killer.ggTier += 1
				Entities.syncRow(killer)
				if killer.alive then
					Spawner.giveWeapons(killer)
					Spawner.sendLoadout(killer)
				end
				if killer.player then
					Remotes.Notify:FireClient(killer.player, {
						kind = "tier",
						tier = killer.ggTier,
						total = #tiers,
						weapon = Weapons.Defs[tiers[killer.ggTier]].name,
					})
				end
			end
		end
		updateLeader()
	end
end

-- Tur akışı --------------------------------------------------------------

local function countdown(seconds)
	for remaining = seconds, 1, -1 do
		State:SetAttribute("TimeLeft", remaining)
		task.wait(1)
	end
	State:SetAttribute("TimeLeft", 0)
end

local function intermission(nextMode, seconds)
	phase = "Intermission"
	Combat.enabled = false
	Bots.stop()
	for _, entity in ipairs(Entities.list) do
		Spawner.despawn(entity)
	end

	mode = nextMode
	Spawner.mode = mode
	Bots.mode = mode
	Entities.ffa = mode.ffa
	Entities.resetStats()
	ggWinner = nil
	for _, team in ipairs(Config.Teams) do
		setScore(team.id, 0)
	end
	rebalance()

	local preset = MapBuilder.Lighting[rng:NextInteger(1, #MapBuilder.Lighting)]
	MapBuilder.applyLighting(Lighting, preset)

	resetPoints()
	mapData.pointsFolder.Parent = mode.id == "dom" and workspace or nil

	State:SetAttribute("Mode", mode.id)
	State:SetAttribute("ModeName", mode.name)
	State:SetAttribute("ModeInfo", mode.description)
	State:SetAttribute("Target", mode.tiers and #mode.tiers or mode.target)
	State:SetAttribute("FFA", mode.ffa)
	State:SetAttribute("Weather", preset.name)
	State:SetAttribute("Winner", "")
	State:SetAttribute("WinnerName", "")
	State:SetAttribute("LeaderName", "")
	State:SetAttribute("LeaderTier", 1)
	State:SetAttribute("Phase", phase)

	countdown(seconds)
end

local function leadingTeam()
	local first, second = Config.Teams[1].id, Config.Teams[2].id
	if scores[first] > scores[second] then
		return first
	elseif scores[second] > scores[first] then
		return second
	end
	return ""
end

local function play()
	phase = "Playing"
	Combat.enabled = true
	State:SetAttribute("TimeLeft", mode.duration)
	State:SetAttribute("Phase", phase)
	Remotes.Notify:FireAllClients({ kind = "round", title = mode.name, text = mode.description })
	Bots.start()

	if mode.id == "dom" then
		task.spawn(function()
			local dt = 0.25
			local playing = mode
			while phase == "Playing" and mode == playing do
				captureStep(dt)
				task.wait(dt)
			end
		end)
	end

	local elapsed = 0
	while true do
		Bots.sync()
		task.wait(1)
		elapsed += 1
		State:SetAttribute("TimeLeft", math.max(0, mode.duration - elapsed))

		if mode.id == "dom" and elapsed % 3 == 0 then
			for _, point in ipairs(mapData.points) do
				if point.owner ~= "" then
					addScore(point.owner, 1)
				end
			end
		end

		if mode.tiers then
			if ggWinner or elapsed >= mode.duration then
				break
			end
		else
			local first, second = Config.Teams[1].id, Config.Teams[2].id
			if scores[first] >= mode.target or scores[second] >= mode.target or elapsed >= mode.duration then
				break
			end
		end
	end
end

local function finish()
	phase = "Ended"
	Combat.enabled = false
	Bots.stop()

	local winnerTeam = ""
	local winnerEntity = nil
	if mode.tiers then
		winnerEntity = ggWinner or updateLeader()
	else
		winnerTeam = leadingTeam()
	end

	for _, entity in ipairs(Entities.list) do
		local player = entity.player
		if player then
			local won = (winnerEntity ~= nil and winnerEntity == entity)
				or (winnerTeam ~= "" and entity.team == winnerTeam)
			local data = PlayerData.get(player)
			if data then
				data.matches += 1
				if won then
					data.wins += 1
				end
				PlayerData.touch(player)
			end
			if won then
				Combat.award(entity, Config.Xp.win, "Zafer")
			elseif entity.score > 0 then
				Combat.award(entity, Config.Xp.loss, "Tur tamamlandı")
			end
			Combat.pushProfile(player)
		end
	end

	State:SetAttribute("Winner", winnerTeam)
	State:SetAttribute("WinnerName", winnerEntity and winnerEntity.name or "")
	State:SetAttribute("Phase", phase)

	task.spawn(PlayerData.saveAll)
	countdown(Config.EndScreen)
end

function Round.run()
	local index = 0
	local first = true
	while true do
		index = index % #Modes.Order + 1
		intermission(Modes.Defs[Modes.Order[index]], first and Config.FirstIntermission or Config.Intermission)
		first = false
		play()
		finish()
	end
end

function Round.init(map)
	mapData = map

	for _, team in ipairs(Config.Teams) do
		local object = Instance.new("Team")
		object.Name = team.name
		object.TeamColor = BrickColor.new(team.brick)
		object.AutoAssignable = false
		object.Parent = Teams
		teamObjects[team.id] = object
		scores[team.id] = 0
	end

	State:SetAttribute("Phase", phase)
	State:SetAttribute("Mode", mode.id)
	State:SetAttribute("ModeName", mode.name)
	State:SetAttribute("ModeInfo", mode.description)
	State:SetAttribute("TimeLeft", 0)

	Combat.Killed:Connect(onKill)

	Remotes.Deploy.OnServerEvent:Connect(function(player)
		local entity = Entities.byPlayer[player]
		if not entity or entity.alive or entity.spawning or phase ~= "Playing" then
			return
		end
		if os.clock() < entity.respawnAt then
			return
		end
		local data = PlayerData.get(player)
		entity.loadout = data and data.loadout or nil
		Spawner.spawnPlayer(entity)
	end)

	Remotes.SetLoadout.OnServerEvent:Connect(function(player, requested)
		local entity = Entities.byPlayer[player]
		if not entity then
			return
		end
		local now = os.clock()
		if entity.lastLoadout and now - entity.lastLoadout < 0.2 then
			return
		end
		entity.lastLoadout = now
		if PlayerData.setLoadout(player, requested) then
			Combat.pushProfile(player)
		end
	end)
end

return Round
