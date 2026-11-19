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

local function gear(character, target, name, size, offset, color, material, shape)
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
	if shape == "round" then
		-- Kutunun içine oturan elips (kask kubbesi, cepler, tulum)
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = part
	elseif shape == "cylinder" then
		part.Shape = Enum.PartType.Cylinder
	end
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = target
	weld.Part1 = part
	weld.Parent = part
	part.Parent = character
	return part
end

local GLOVE = Color3.fromRGB(44, 42, 38)
local BOOT = Color3.fromRGB(46, 38, 30)
local CLOTHES =
	{ Accessory = true, Shirt = true, Pants = true, ShirtGraphic = true, BodyColors = true, CharacterMesh = true }

-- Üniforma: avatar kıyafetleri ve aksesuarları çıkar, gövdeyi takım rengine boya
function Spawner.paint(entity, character)
	for _, item in ipairs(character:GetChildren()) do
		if CLOTHES[item.ClassName] then
			item:Destroy()
		end
	end
	local team = Config.TeamById[entity.team]
	local skin = Config.SkinTones[entity.skinTone or 1] or Config.SkinTones[1]
	local trousers = team.uniform:Lerp(Color3.new(0, 0, 0), 0.25)
	for _, part in ipairs(character:GetChildren()) do
		if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
			local name = part.Name
			if name == "Head" then
				part.Color = skin
			elseif string.find(name, "Hand") then
				part.Color = GLOVE
			elseif string.find(name, "Foot") then
				part.Color = BOOT
				part.Material = Enum.Material.Leather
			elseif string.find(name, "Leg") or name == "LowerTorso" then
				part.Color = trousers
				part.Material = Enum.Material.Fabric
			else
				part.Color = team.uniform
				part.Material = Enum.Material.Fabric
			end
		end
	end
end

local GOGGLE = Color3.fromRGB(40, 60, 70)
local STRAP = Color3.fromRGB(36, 34, 30)
local POUCH_OFFSETS = { -0.62, -0.2, 0.22 }

-- Kask, gözlük, cepli yelek, sırt çantası, telsiz, kol bandı ve dizlik.
-- Vuruş bölgesi adları Ballistics ile uyumludur (Helmet = kafa, Vest = gövde,
-- diğer her şey uzuv sayılır).
function Spawner.dress(entity, character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.MaxHealth = Config.MaxHealth
		humanoid.Health = Config.MaxHealth
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
		humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
		-- Ölünce parçalara ayrılmasın: Combat.ragdoll eklemleri mafsala çevirir
		humanoid.BreakJointsOnDeath = false
	end

	local team = Config.TeamById[entity.team]
	local uniform = team.uniform
	local dark = uniform:Lerp(Color3.new(0, 0, 0), 0.35)
	local webbing = uniform:Lerp(Color3.new(0, 0, 0), 0.5)

	local head = character:FindFirstChild("Head")
	if head then
		local hs = head.Size
		-- Kubbe kask, kenar, takım bandı ve kask üstünde gözlük
		gear(
			character,
			head,
			"Helmet",
			Vector3.new(hs.X * 1.32, hs.Y * 0.95, hs.Z * 1.38),
			CFrame.new(0, hs.Y * 0.32, 0.02),
			dark,
			Enum.Material.Fabric,
			"round"
		)
		gear(
			character,
			head,
			"Helmet",
			Vector3.new(hs.X * 1.4, hs.Y * 0.12, hs.Z * 1.46),
			CFrame.new(0, hs.Y * 0.18, 0.02),
			dark:Lerp(Color3.new(0, 0, 0), 0.2),
			Enum.Material.Fabric,
			"round"
		)
		gear(
			character,
			head,
			"Helmet",
			Vector3.new(hs.X * 1.34, hs.Y * 0.1, hs.Z * 1.4),
			CFrame.new(0, hs.Y * 0.36, 0.02),
			team.color,
			Enum.Material.Fabric,
			"round"
		)
		gear(
			character,
			head,
			"Helmet",
			Vector3.new(hs.X * 0.95, hs.Y * 0.08, 0.1),
			CFrame.new(0, hs.Y * 0.5, -hs.Z * 0.6),
			STRAP,
			Enum.Material.Fabric
		)
		for _, side in ipairs({ -1, 1 }) do
			gear(
				character,
				head,
				"Helmet",
				Vector3.new(0.12, hs.Y * 0.24, hs.Y * 0.24),
				CFrame.new(side * hs.X * 0.2, hs.Y * 0.52, -hs.Z * 0.64) * CFrame.Angles(0, math.rad(90), 0),
				GOGGLE,
				Enum.Material.Glass,
				"cylinder"
			)
		end
	end

	local torso = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
	if torso then
		local size = torso.Size
		local front = -size.Z / 2 - 0.15
		local back = size.Z / 2 + 0.15
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(size.X + 0.22, size.Y * 0.92, size.Z + 0.26),
			CFrame.new(0, -size.Y * 0.02, 0),
			dark,
			Enum.Material.Fabric
		)
		-- Önde üç şarjör cebi, göğüste takım arması
		for _, x in ipairs(POUCH_OFFSETS) do
			gear(
				character,
				torso,
				"Vest",
				Vector3.new(0.36, 0.48, 0.22),
				CFrame.new(x * size.X / 2, -size.Y * 0.18, front - 0.06),
				webbing,
				Enum.Material.Fabric
			)
			gear(
				character,
				torso,
				"Vest",
				Vector3.new(0.38, 0.1, 0.24),
				CFrame.new(x * size.X / 2, -size.Y * 0.18 + 0.24, front - 0.07),
				STRAP,
				Enum.Material.Fabric
			)
		end
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(0.5, 0.34, 0.06),
			CFrame.new(size.X * 0.24, size.Y * 0.24, front),
			team.color,
			Enum.Material.Fabric
		)
		-- Omuz askıları
		for _, side in ipairs({ -1, 1 }) do
			gear(
				character,
				torso,
				"Vest",
				Vector3.new(0.34, 0.12, size.Z + 0.34),
				CFrame.new(side * size.X * 0.3, size.Y * 0.46, 0),
				STRAP,
				Enum.Material.Fabric
			)
		end
		-- Sırt çantası, üstünde uyku tulumu, yanında telsiz anteni
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(size.X * 0.7, size.Y * 0.78, 0.55),
			CFrame.new(0, -size.Y * 0.05, back + 0.2),
			webbing,
			Enum.Material.Fabric
		)
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(size.X * 0.74, 0.34, 0.34),
			CFrame.new(0, size.Y * 0.38, back + 0.22),
			uniform:Lerp(Color3.new(1, 1, 1), 0.15),
			Enum.Material.Fabric,
			"cylinder"
		)
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(0.28, 0.4, 0.2),
			CFrame.new(-size.X * 0.22, -size.Y * 0.1, back + 0.55),
			STRAP,
			Enum.Material.Plastic
		)
		gear(
			character,
			torso,
			"Gear",
			Vector3.new(0.05, 1.6, 0.05),
			CFrame.new(-size.X * 0.26, size.Y * 0.55, back + 0.55),
			STRAP,
			Enum.Material.Plastic
		)
		-- Sırtta takım işareti
		gear(
			character,
			torso,
			"Vest",
			Vector3.new(1.0, 0.36, 0.06),
			CFrame.new(0, size.Y * 0.12, back + 0.5),
			team.color,
			Enum.Material.Fabric
		)
	end

	local lower = character:FindFirstChild("LowerTorso")
	if lower then
		local size = lower.Size
		gear(
			character,
			lower,
			"Vest",
			Vector3.new(size.X + 0.2, 0.26, size.Z + 0.2),
			CFrame.new(0, size.Y * 0.2, 0),
			STRAP,
			Enum.Material.Fabric
		)
	end

	-- Sol omuzda takım kol bandı
	local leftArm = character:FindFirstChild("LeftUpperArm") or character:FindFirstChild("Left Arm")
	if leftArm then
		local size = leftArm.Size
		gear(
			character,
			leftArm,
			"Gear",
			Vector3.new(size.X + 0.08, 0.3, size.Z + 0.08),
			CFrame.new(0, size.Y * 0.18, 0),
			team.color,
			Enum.Material.Fabric
		)
	end

	-- Dizlikler
	for _, name in ipairs({ "LeftLowerLeg", "RightLowerLeg" }) do
		local leg = character:FindFirstChild(name)
		if leg then
			local size = leg.Size
			gear(
				character,
				leg,
				"Gear",
				Vector3.new(size.X * 0.8, 0.42, 0.2),
				CFrame.new(0, size.Y * 0.34, -size.Z / 2 - 0.06),
				STRAP,
				Enum.Material.Rubber,
				"round"
			)
		end
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
	if entity.isBot or Config.UniformAvatars then
		Spawner.paint(entity, character)
	end
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
