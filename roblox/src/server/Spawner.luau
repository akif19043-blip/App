-- Karakteri sahaya indirir: doğuş noktası seçer, kask ve yelek giydirir,
-- kolları silah tutar duruma getirir, silahları verir.

local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local GunModels = require(Shared.GunModels)
local Loadout = require(Shared.Loadout)
local Weapons = require(Shared.Weapons)

local Entities = require(script.Parent.Entities)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")

local Spawner = {}

Spawner.mode = nil -- o anki mod tanımı (Round ayarlar)

local mapData
local rng = Random.new()

function Spawner.setMap(data)
	mapData = data
end

local function gear(character, target, name, size, offset, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Color = color
	part.Material = material
	part.CanCollide = false
	part.CanTouch = false
	part.Massless = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CFrame = target.CFrame * offset
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = target
	weld.Part1 = part
	weld.Parent = part
	part.Parent = character
	return part
end

-- Kask, yelek ve takım rengi. Vuruş bölgesi adları Ballistics ile uyumludur
-- (Helmet = kafa, Vest = gövde).
function Spawner.dress(entity, character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.MaxHealth = Config.MaxHealth
		humanoid.Health = Config.MaxHealth
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
		humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	end

	local team = Config.TeamById[entity.team]
	local uniform = team.uniform
	local dark = uniform:Lerp(Color3.new(0, 0, 0), 0.35)

	local head = character:FindFirstChild("Head")
	if head then
		gear(character, head, "Helmet", Vector3.new(1.5, 0.72, 1.55), CFrame.new(0, 0.42, 0), dark, Enum.Material.Metal)
		gear(
			character,
			head,
			"Helmet",
			Vector3.new(1.54, 0.16, 1.59),
			CFrame.new(0, 0.2, 0),
			team.color,
			Enum.Material.Fabric
		)
	end

	local torso = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
	if torso then
		local size = torso.Size
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(size.X + 0.22, size.Y * 0.92, size.Z + 0.26),
			CFrame.new(0, 0, 0),
			dark,
			Enum.Material.Fabric
		)
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(0.6, 0.4, 0.06),
			CFrame.new(0.5, size.Y * 0.2, -size.Z / 2 - 0.15),
			team.color,
			Enum.Material.Fabric
		)
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(1.2, 0.5, 0.06),
			CFrame.new(0, size.Y * 0.2, size.Z / 2 + 0.15),
			team.color,
			Enum.Material.Fabric
		)
	end

	character:SetAttribute("Team", entity.team)
	character:SetAttribute("EntityName", entity.name)
	character:SetAttribute("Bot", entity.isBot)
end

-- Kolları öne kaldırır; yürüme animasyonu bunun üstüne biner.
function Spawner.pose(character)
	local rightUpper = character:FindFirstChild("RightUpperArm")
	local leftUpper = character:FindFirstChild("LeftUpperArm")
	if rightUpper and leftUpper then
		local right = rightUpper:FindFirstChild("RightShoulder")
		local left = leftUpper:FindFirstChild("LeftShoulder")
		if right and right:IsA("Motor6D") then
			right.C0 = right.C0 * CFrame.Angles(math.rad(86), 0, 0)
		end
		if left and left:IsA("Motor6D") then
			left.C0 = left.C0 * CFrame.Angles(math.rad(78), 0, math.rad(36))
		end
		return
	end
	local torso = character:FindFirstChild("Torso")
	if torso then
		local right = torso:FindFirstChild("Right Shoulder")
		local left = torso:FindFirstChild("Left Shoulder")
		if right and right:IsA("Motor6D") then
			right.C0 = right.C0 * CFrame.Angles(0, 0, math.rad(90))
		end
		if left and left:IsA("Motor6D") then
			left.C0 = left.C0 * CFrame.Angles(0, 0, math.rad(-80))
		end
	end
end

-- Karakterin elindeki (başkalarının gördüğü) silah
function Spawner.equipWorld(entity, weaponId)
	local character = entity.character
	if not character then
		return
	end
	local old = character:FindFirstChild("WorldGun")
	if old then
		old:Destroy()
	end
	local weapon = entity.weapons[weaponId]
	if not weapon then
		return
	end
	character:SetAttribute("Weapon", weaponId)
	character:SetAttribute("Suppressed", weapon.stats.suppressed == true)

	local hand = character:FindFirstChild("RightHand")
	local offset = CFrame.new(0, -0.15, -0.2) * CFrame.Angles(-math.pi / 2, 0, 0)
	if not hand then
		hand = character:FindFirstChild("Right Arm")
		offset = CFrame.new(0, -1.1, -0.2) * CFrame.Angles(-math.pi / 2, 0, 0)
	end
	if not hand then
		return
	end

	local model = GunModels.build(weapon.stats, { world = true, name = "WorldGun" })
	model:PivotTo(hand.CFrame * offset)
	local weld = Instance.new("Weld")
	weld.Part0 = hand
	weld.Part1 = model.PrimaryPart
	weld.C0 = offset
	weld.Parent = model.PrimaryPart
	model.Parent = character
end

local function addWeapon(entity, id, attachments)
	local stats = Weapons.resolve(id, attachments)
	entity.weapons[id] = {
		id = id,
		stats = stats,
		attachments = stats.attachments,
		mag = stats.magSize,
		reserve = stats.reserve,
		tokens = 2,
		lastToken = os.clock(),
		reloadEnd = nil,
	}
	table.insert(entity.order, id)
end

function Spawner.giveWeapons(entity)
	entity.weapons = {}
	entity.order = {}
	local mode = Spawner.mode
	if mode and mode.tiers then
		local tier = math.clamp(entity.ggTier, 1, #mode.tiers)
		local id = mode.tiers[tier]
		addWeapon(entity, id, nil)
		if id ~= Weapons.Melee then
			addWeapon(entity, Weapons.Melee, nil)
		end
		entity.grenades = 0
	else
		local loadout = entity.loadout or Loadout.Default
		local attachments = loadout.attachments or {}
		addWeapon(entity, loadout.primary, attachments[loadout.primary])
		addWeapon(entity, loadout.secondary, attachments[loadout.secondary])
		addWeapon(entity, Weapons.Melee, nil)
		entity.grenades = Config.Grenades
	end
	entity.currentWeapon = entity.order[1]
	Spawner.equipWorld(entity, entity.currentWeapon)
end

-- İstemcinin kendi silahlarını kurması için gönderilen özet
function Spawner.clientLoadout(entity)
	local weapons = {}
	for _, id in ipairs(entity.order) do
		table.insert(weapons, { id = id, attachments = entity.weapons[id].attachments })
	end
	return { weapons = weapons, grenades = entity.grenades, tier = entity.ggTier }
end

function Spawner.sendLoadout(entity)
	if entity.player then
		Remotes.Spawned:FireClient(entity.player, Spawner.clientLoadout(entity))
	end
end

local function nearestEnemyDistance(entity, position)
	local best = math.huge
	for _, other in ipairs(Entities.list) do
		if other.alive and Entities.isEnemy(entity, other) then
			local otherPosition = Entities.position(other)
			if otherPosition then
				best = math.min(best, (otherPosition - position).Magnitude)
			end
		end
	end
	return best
end

function Spawner.pickSpawn(entity)
	local candidates = Entities.ffa and mapData.ffaSpawns or mapData.spawns[entity.team]
	local bestSpawn, bestScore = candidates[1], -1
	local safe = {}
	for _, spawn in ipairs(candidates) do
		local distance = nearestEnemyDistance(entity, spawn.Position)
		local score = math.min(distance, 400) + rng:NextNumber(0, 25)
		if score > bestScore then
			bestSpawn, bestScore = spawn, score
		end
		if distance > 60 then
			table.insert(safe, spawn)
		end
	end
	if not Entities.ffa and #safe > 0 then
		return safe[rng:NextInteger(1, #safe)]
	end
	return bestSpawn
end

-- Oyuncu ya da bot fark etmez: hazır bir karakter modelini sahaya yerleştirir.
function Spawner.place(entity, character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return false
	end
	character:PivotTo(Spawner.pickSpawn(entity))
	Spawner.dress(entity, character)
	Spawner.pose(character)
	Entities.setCharacter(entity, character, humanoid)

	entity.alive = true
	entity.damagers = {}
	entity.lastDamageTime = 0
	entity.protectedUntil = os.clock() + Config.SpawnProtection
	local shield = Instance.new("ForceField")
	shield.Visible = true
	shield.Parent = character
	Debris:AddItem(shield, Config.SpawnProtection)

	Spawner.giveWeapons(entity)
	Entities.syncRow(entity)

	humanoid.Died:Connect(function()
		Entities.CharacterDied:Fire(entity, character)
	end)
	return true
end

function Spawner.spawnPlayer(entity)
	local player = entity.player
	if not player or entity.spawning then
		return false
	end
	entity.spawning = true
	local ok = pcall(function()
		player:LoadCharacter()
	end)
	entity.spawning = false
	local character = player.Character
	if not ok or not character or entity.removed then
		return false
	end
	character:WaitForChild("Humanoid", 5)
	if not Spawner.place(entity, character) then
		return false
	end
	Spawner.sendLoadout(entity)
	return true
end

function Spawner.despawn(entity)
	local character = entity.character
	entity.alive = false
	Entities.clearCharacter(entity)
	if character then
		character:Destroy()
	end
	Entities.syncRow(entity)
end

return Spawner
