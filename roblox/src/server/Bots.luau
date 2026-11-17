-- Botlar. Yeni açılan bir oyunda sunucu boş olur; botlar takımları doldurur ki
-- tek başına giren oyuncu da çatışma bulsun. Oyuncu geldikçe botlar çıkar.
--
-- Her bot yaklaşık saniyede beş kez düşünür: görüş hattındaki en yakın düşmanı
-- arar; varsa ona döner, kısa bir tepki süresinden sonra salvolar hâlinde ateş
-- eder; yoksa modun hedefine (bölge, düşmanın son görüldüğü yer) yürür.

local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ballistics = require(Shared.Ballistics)
local Config = require(Shared.Config)
local Util = require(Shared.Util)
local Weapons = require(Shared.Weapons)

local Combat = require(script.Parent.Combat)
local Entities = require(script.Parent.Entities)
local Spawner = require(script.Parent.Spawner)

local Bots = {}

Bots.active = false
Bots.mode = nil

local NAMES = {
	"Demir",
	"Kaya",
	"Yılmaz",
	"Aslan",
	"Tuna",
	"Aras",
	"Çelik",
	"Doruk",
	"Ege",
	"Kuzey",
	"Poyraz",
	"Bora",
	"Toprak",
	"Alp",
	"Yiğit",
	"Kaan",
	"Mert",
	"Baran",
	"Deniz",
	"Ozan",
	"Tekin",
	"Şimşek",
	"Korkmaz",
	"Erdem",
}

local ANIMATIONS = {
	idle = "rbxassetid://507766666",
	run = "rbxassetid://507767714",
}

local SKIN = {
	Color3.fromRGB(234, 184, 146),
	Color3.fromRGB(204, 142, 105),
	Color3.fromRGB(160, 110, 80),
	Color3.fromRGB(110, 76, 56),
}

local bots = {}
local mapData
local template
local templateFailed = false
local rng = Random.new()
local nameIndex = rng:NextInteger(1, #NAMES)

local templateLoading = false

local function getTemplate()
	while templateLoading do
		task.wait(0.1)
	end
	if template or templateFailed then
		return template
	end
	templateLoading = true
	local ok, result = pcall(function()
		return Players:CreateHumanoidModelFromDescriptionAsync(
			Instance.new("HumanoidDescription"),
			Enum.HumanoidRigType.R15
		)
	end)
	if not ok then
		-- Eski sürüm adı (yeni ad bulunamazsa)
		ok, result = pcall(function()
			return (Players :: any):CreateHumanoidModelFromDescription(
				Instance.new("HumanoidDescription"),
				Enum.HumanoidRigType.R15
			)
		end)
	end
	templateLoading = false
	if not ok or not result then
		templateFailed = true
		warn("[Bozkır] Bot gövdesi oluşturulamadı, botlar kapalı:", result)
		return nil
	end
	for _, item in ipairs(result:GetDescendants()) do
		if item:IsA("LuaSourceContainer") or item:IsA("BodyColors") then
			item:Destroy()
		end
	end
	template = result
	return template
end

local function animate(humanoid)
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = humanoid
	end
	local tracks = {}
	for name, id in pairs(ANIMATIONS) do
		local animation = Instance.new("Animation")
		animation.AnimationId = id
		local ok, track = pcall(function()
			return animator:LoadAnimation(animation)
		end)
		if ok and track then
			track.Looped = true
			tracks[name] = track
		end
	end
	local current
	local function play(name)
		if current == name then
			return
		end
		if current and tracks[current] then
			tracks[current]:Stop(0.2)
		end
		current = name
		if tracks[name] then
			tracks[name]:Play(0.2)
		end
	end
	play("idle")
	humanoid.Running:Connect(function(speed)
		play(speed > 1 and "run" or "idle")
	end)
end

local function chooseGoal(bot, root, now)
	local entity = bot.entity
	local mode = Bots.mode
	local goal

	if mode and mode.id == "dom" and #mapData.points > 0 then
		local options = {}
		for _, point in ipairs(mapData.points) do
			local weight = point.model:GetAttribute("Owner") == entity.team and 1 or 3
			for _ = 1, weight do
				table.insert(options, point)
			end
		end
		goal = options[rng:NextInteger(1, #options)].position
	elseif bot.lastSeen and rng:NextNumber() < 0.6 then
		goal = bot.lastSeen
	elseif rng:NextNumber() < 0.55 then
		-- En yakın düşmanın olduğu yöne git (çatışma hep sürsün)
		local best = math.huge
		for _, other in ipairs(Entities.list) do
			if other.alive and Entities.isEnemy(entity, other) then
				local position = Entities.position(other)
				if position then
					local distance = (position - root.Position).Magnitude
					if distance < best then
						best, goal = distance, position
					end
				end
			end
		end
	end
	bot.lastSeen = nil
	if not goal then
		goal = mapData.hotspots[rng:NextInteger(1, #mapData.hotspots)]
	end

	bot.goal = Vector3.new(goal.X + rng:NextNumber(-7, 7), 3, goal.Z + rng:NextNumber(-7, 7))
	bot.goalUntil = now + 16
	bot.path = nil
	bot.nextPathTime = 0
end

local function computePath(bot, from)
	local path = PathfindingService:CreatePath({
		AgentRadius = 2.5,
		AgentHeight = 5.5,
		AgentCanJump = true,
		WaypointSpacing = 8,
	})
	local goal = bot.goal
	local ok = pcall(function()
		path:ComputeAsync(from, goal)
	end)
	if bot.goal ~= goal then
		return
	end
	if ok and path.Status == Enum.PathStatus.Success then
		bot.path = path:GetWaypoints()
		bot.index = 2
	else
		bot.path = nil
	end
end

local function navigate(bot, humanoid, root, now, dt)
	humanoid.AutoRotate = true
	if not bot.goal or now > bot.goalUntil or Util.flat(bot.goal - root.Position).Magnitude < 6 then
		chooseGoal(bot, root, now)
	end

	if not bot.path and now >= bot.nextPathTime then
		bot.nextPathTime = now + 2
		computePath(bot, root.Position)
	end

	local path = bot.path
	if path then
		local waypoint = path[bot.index]
		if waypoint and Util.flat(waypoint.Position - root.Position).Magnitude < 3.5 then
			bot.index += 1
			waypoint = path[bot.index]
		end
		if not waypoint then
			bot.path = nil
			bot.goal = nil
			return
		end
		if waypoint.Action == Enum.PathWaypointAction.Jump then
			humanoid.Jump = true
		end
		humanoid:MoveTo(waypoint.Position)
	elseif bot.goal then
		humanoid:MoveTo(bot.goal)
	end

	-- Takıldıysa zıpla ve yeni yol iste
	if (root.Position - bot.lastPosition).Magnitude < 0.5 then
		bot.stuck += dt
		if bot.stuck > 1.2 then
			bot.stuck = 0
			bot.stuckCount += 1
			humanoid.Jump = true
			bot.path = nil
			if bot.stuckCount >= 3 then
				bot.stuckCount = 0
				bot.goal = nil
			end
		end
	else
		bot.stuck = 0
	end
	bot.lastPosition = root.Position
end

local function pickTarget(bot, root, now)
	local entity = bot.entity
	local head = Entities.headPosition(entity)
	if not head then
		return nil
	end
	local look = root.CFrame.LookVector
	local candidates = {}
	for _, other in ipairs(Entities.list) do
		if other.alive and other.character and Entities.isEnemy(entity, other) then
			local position = Entities.position(other)
			if position then
				local offset = position - root.Position
				local distance = offset.Magnitude
				if distance < bot.sight then
					local aware = distance < 45
						or now < bot.alertUntil
						or bot.target == other
						or offset.Unit:Dot(look) > 0.2
					if aware then
						table.insert(candidates, { entity = other, distance = distance })
					end
				end
			end
		end
	end
	table.sort(candidates, function(a, b)
		return a.distance < b.distance
	end)
	for index = 1, math.min(3, #candidates) do
		local candidate = candidates[index]
		local targetHead = Entities.headPosition(candidate.entity)
		if targetHead and not Combat.blocked(head, targetHead) then
			return candidate.entity, candidate.distance
		end
	end
	return nil
end

local function engage(bot, character, humanoid, root, target, distance, now, dt)
	local entity = bot.entity
	local weapon = entity.weapons[entity.currentWeapon]
	if not weapon then
		return
	end
	local stats = weapon.stats
	local targetPosition = Entities.position(target)
	local targetHead = Entities.headPosition(target)
	if not targetPosition or not targetHead then
		return
	end

	if bot.target ~= target then
		bot.target = target
		bot.reactAt = now + rng:NextNumber(0.4, 0.9) / bot.skill
		bot.burstLeft = 0
	end
	bot.lastSeen = targetPosition
	bot.path = nil
	bot.goal = nil

	-- Hedefe dön
	humanoid.AutoRotate = false
	local flat = Vector3.new(targetPosition.X, root.Position.Y, targetPosition.Z)
	if (flat - root.Position).Magnitude > 0.5 then
		root.CFrame = CFrame.lookAt(root.Position, flat)
	end
	local aim = targetHead - root.Position
	if aim.Magnitude > 0.1 then
		character:SetAttribute("AimPitch", math.floor(math.asin(math.clamp(aim.Unit.Y, -1, 1)) * 50 + 0.5) / 50)
	end

	-- Mesafeyi ayarla: uzaksa yaklaş, yakınsa yana kay
	local preferred = stats.melee and 0 or math.clamp(stats.falloffStart * 0.9, 18, 90)
	if stats.melee or distance > preferred * 1.6 then
		humanoid:MoveTo(targetPosition)
	else
		if now > bot.strafeUntil then
			bot.strafeDirection = rng:NextInteger(-1, 1)
			bot.strafeUntil = now + rng:NextNumber(0.6, 1.4)
		end
		humanoid:MoveTo(root.Position + root.CFrame.RightVector * bot.strafeDirection * 6)
	end

	if now < bot.reactAt or now < bot.nextShot then
		return
	end

	if stats.melee then
		if distance < Config.MeleeRange then
			bot.nextShot = now + 0.9
			entity.protectedUntil = 0
			Combat.damage(entity, target, stats.damage, { weaponId = stats.id, melee = true })
		end
		return
	end

	if bot.reloadUntil or now < bot.pauseUntil then
		return
	end

	if bot.burstLeft <= 0 then
		bot.burstLeft = stats.fireMode == "auto" and rng:NextInteger(3, 7) or rng:NextInteger(1, 2)
	end
	local interval = 60 / stats.rpm
	local shots
	if interval >= dt then
		shots = 1
		bot.nextShot = now + interval * rng:NextNumber(1.1, 1.7)
	else
		shots = math.clamp(math.floor(dt / interval), 1, bot.burstLeft)
	end
	shots = math.min(shots, weapon.mag)
	if shots <= 0 then
		bot.reloadUntil = now + stats.reloadTime
		return
	end

	-- İsabet olasılığı: beceri, mesafe ve hedefin hareketi
	local reach = math.max(stats.falloffEnd * 1.4, 60)
	local chance = 0.3 * bot.skill * math.clamp(1.15 - distance / reach, 0.2, 1)
	if stats.class == "Sniper" or stats.class == "DMR" then
		chance *= 1.5
	end
	local targetRoot = Entities.rootPart(target)
	if targetRoot and targetRoot.AssemblyLinearVelocity.Magnitude > 12 then
		chance *= 0.7
	end

	local endpoints = {}
	local total = 0
	local headshot = false
	for _ = 1, shots do
		if rng:NextNumber() < chance then
			local roll = rng:NextNumber()
			local partName = roll < 0.1 and "Head" or (roll < 0.7 and "UpperTorso" or "LeftUpperLeg")
			local damage, zone = Ballistics.damageFor(stats, distance, partName)
			if stats.pellets > 1 then
				damage *= math.max(1, stats.pellets * math.clamp(1 - distance / stats.falloffEnd, 0.15, 0.75))
			end
			total += damage
			headshot = headshot or zone == "head"
			table.insert(endpoints, zone == "head" and targetHead or targetPosition)
		else
			table.insert(
				endpoints,
				targetPosition + Vector3.new(rng:NextNumber(-4, 4), rng:NextNumber(-1, 4), rng:NextNumber(-4, 4))
			)
		end
	end

	weapon.mag -= shots
	bot.burstLeft -= shots
	if bot.burstLeft <= 0 then
		bot.pauseUntil = now + rng:NextNumber(0.35, 0.9)
	end
	if weapon.mag <= 0 then
		bot.reloadUntil = now + stats.reloadTime
	end

	entity.protectedUntil = 0
	Combat.broadcastShot(entity, stats.id, endpoints, stats.suppressed)
	if total > 0 then
		Combat.damage(entity, target, total, { weaponId = stats.id, headshot = headshot, distance = distance })
	end
end

local function step(bot, character, humanoid, root, dt)
	local entity = bot.entity
	local now = os.clock()

	local weapon = entity.weapons[entity.currentWeapon]
	if bot.weaponId ~= entity.currentWeapon then
		-- Silah değişti (Silah Yarışı'nda seviye atlayınca)
		bot.weaponId = entity.currentWeapon
		bot.reloadUntil = nil
		bot.burstLeft = 0
		local class = weapon and weapon.stats.class
		bot.sight = class == "Sniper" and 420 or class == "DMR" and 320 or class == "Shotgun" and 140 or 230
	end
	if weapon and bot.reloadUntil and now >= bot.reloadUntil then
		weapon.mag = weapon.stats.magSize
		bot.reloadUntil = nil
	end

	local target, distance = pickTarget(bot, root, now)
	if target then
		engage(bot, character, humanoid, root, target, distance, now, dt)
	else
		bot.target = nil
		navigate(bot, humanoid, root, now, dt)
	end
end

local function think(bot, character)
	local entity = bot.entity
	local humanoid = entity.humanoid
	local root = character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root then
		return
	end
	local dt = 0.2
	task.wait(rng:NextNumber(0, dt))
	while Bots.active and entity.alive and entity.character == character and character.Parent do
		local ok, problem = pcall(step, bot, character, humanoid, root, dt)
		if not ok then
			warn("[Bozkır] Bot hatası:", problem)
		end
		task.wait(dt)
	end
end

local function spawnBot(bot)
	bot.spawning = true
	local source = getTemplate()
	local entity = bot.entity
	if not source or entity.removed or not Bots.active then
		bot.spawning = false
		return
	end

	local character = source:Clone()
	character.Name = entity.name
	local team = Config.TeamById[entity.team]
	local skin = SKIN[bot.skin]
	for _, part in ipairs(character:GetDescendants()) do
		if part:IsA("BasePart") then
			local name = part.Name
			if name == "Head" or name == "LeftHand" or name == "RightHand" then
				part.Color = skin
			elseif string.find(name, "Leg") or string.find(name, "Foot") or name == "LowerTorso" then
				part.Color = team.uniform:Lerp(Color3.new(0, 0, 0), 0.25)
			else
				part.Color = team.uniform
			end
		end
	end

	if not (Bots.mode and Bots.mode.tiers) then
		local primary = Weapons.Primaries[rng:NextInteger(1, #Weapons.Primaries)]
		entity.loadout = { primary = primary, secondary = "akrep", attachments = {} }
	end

	if not Spawner.place(entity, character) then
		character:Destroy()
		bot.spawning = false
		return
	end
	character.Parent = workspace

	local humanoid = entity.humanoid
	local root = character:FindFirstChild("HumanoidRootPart")
	humanoid.WalkSpeed = 14 + bot.skill * 3
	if root then
		pcall(function()
			root:SetNetworkOwner(nil)
		end)
	end

	bot.target = nil
	bot.goal = nil
	bot.path = nil
	bot.index = 1
	bot.goalUntil = 0
	bot.nextPathTime = 0
	bot.lastSeen = nil
	bot.reactAt = 0
	bot.nextShot = 0
	bot.pauseUntil = 0
	bot.reloadUntil = nil
	bot.burstLeft = 0
	bot.strafeDirection = 0
	bot.strafeUntil = 0
	bot.alertUntil = 0
	bot.stuck = 0
	bot.stuckCount = 0
	bot.weaponId = nil
	bot.sight = 230
	bot.lastPosition = root and root.Position or Vector3.zero
	bot.spawning = false

	animate(humanoid)
	task.spawn(think, bot, character)
end

local function addBot(teamId)
	nameIndex = nameIndex % #NAMES + 1
	local entity = Entities.create({ name = NAMES[nameIndex], isBot = true, team = teamId })
	local bot = {
		entity = entity,
		skill = rng:NextNumber(0.7, 1.15),
		skin = rng:NextInteger(1, #SKIN),
		spawning = false,
		alertUntil = 0,
	}
	entity.onDamaged = function(attacker)
		bot.alertUntil = os.clock() + 4
		if attacker then
			bot.lastSeen = Entities.position(attacker) or bot.lastSeen
		end
	end
	entity.respawnAt = os.clock() + rng:NextNumber(0, 2)
	table.insert(bots, bot)
end

local function removeBot(index)
	local bot = bots[index]
	table.remove(bots, index)
	Spawner.despawn(bot.entity)
	Entities.remove(bot.entity)
end

-- Bot sayısını oyuncu sayısına göre ayarlar ve ölenleri yeniden doğurur.
-- Round her saniye çağırır.
function Bots.sync()
	if not Bots.active then
		return
	end

	local want = {}
	if Entities.ffa then
		local total = math.max(0, Config.FillFreeForAll - Entities.count(nil, "player"))
		want[Config.Teams[1].id] = math.ceil(total / 2)
		want[Config.Teams[2].id] = math.floor(total / 2)
	else
		for _, team in ipairs(Config.Teams) do
			want[team.id] = math.max(0, Config.FillPerTeam - Entities.count(team.id, "player"))
		end
	end

	for _, team in ipairs(Config.Teams) do
		local have = Entities.count(team.id, "bot")
		while have < want[team.id] do
			addBot(team.id)
			have += 1
		end
		if have > want[team.id] then
			-- Önce ölü botları çıkar
			for pass = 1, 2 do
				for index = #bots, 1, -1 do
					local bot = bots[index]
					if have > want[team.id] and bot.entity.team == team.id and (pass == 2 or not bot.entity.alive) then
						removeBot(index)
						have -= 1
					end
				end
			end
		end
	end

	local now = os.clock()
	for _, bot in ipairs(bots) do
		local entity = bot.entity
		if not entity.alive and not bot.spawning and now >= entity.respawnAt then
			task.spawn(spawnBot, bot)
		end
	end
end

function Bots.start()
	Bots.active = true
	local now = os.clock()
	for _, bot in ipairs(bots) do
		bot.entity.respawnAt = now + rng:NextNumber(0, 1.5)
	end
end

function Bots.stop()
	Bots.active = false
	for _, bot in ipairs(bots) do
		Spawner.despawn(bot.entity)
	end
end

function Bots.init(data)
	mapData = data
	-- Gövde şablonunu önceden hazırla (ilk tur beklemesin)
	task.spawn(getTemplate)
end

return Bots
