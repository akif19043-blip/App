-- Çatışma: atış doğrulama, hasar, ölüm, bıçak, el bombası, can yenileme.
--
-- Vuruşu istemci bildirir (kendi ekranında gördüğü geçerlidir), sunucu
-- denetler: silah onda mı, şarjöründe mermi var mı, atış hızı mümkün mü,
-- hedef söylenen yerin yakınında mı, arada duvar var mı.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ballistics = require(Shared.Ballistics)
local Config = require(Shared.Config)
local Ranks = require(Shared.Ranks)
local Signal = require(Shared.Signal)
local Weapons = require(Shared.Weapons)

local Entities = require(script.Parent.Entities)
local PlayerData = require(script.Parent.PlayerData)
local Spawner = require(script.Parent.Spawner)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")

local Combat = {}

Combat.enabled = false
-- { victim, killer, weaponId, headshot, melee }
Combat.Killed = Signal.new()

local losParams = RaycastParams.new()
losParams.FilterType = Enum.RaycastFilterType.Include

local projectiles

function Combat.pushProfile(player)
	Remotes.Profile:FireClient(player, PlayerData.public(player))
end

function Combat.award(entity, amount, text)
	if entity.removed then
		return
	end
	entity.score += amount
	Entities.syncRow(entity)
	local player = entity.player
	if not player then
		return
	end
	local rank, unlocked = PlayerData.addXp(player, amount)
	Remotes.Notify:FireClient(player, { kind = "xp", amount = amount, text = text })
	if rank then
		player:SetAttribute("Rank", rank)
		Remotes.Notify:FireClient(player, { kind = "rank", rank = rank, name = Ranks.name(rank), unlocked = unlocked })
		Combat.pushProfile(player)
	end
end

function Combat.announce(text, teamId)
	Remotes.Notify:FireAllClients({ kind = "announce", text = text, team = teamId })
end

-- Görüş hattı: yalnızca harita geometrisine bakar.
function Combat.blocked(from, to)
	local offset = to - from
	local distance = offset.Magnitude
	if distance < 2 then
		return false
	end
	return workspace:Raycast(from, offset.Unit * (distance - 1.5), losParams) ~= nil
end

function Combat.kill(victim, attacker, info)
	if not victim.alive then
		return
	end
	info = info or {}
	local now = os.clock()
	victim.alive = false
	victim.deaths += 1
	victim.streak = 0
	victim.respawnAt = now + Config.RespawnDelay

	local humanoid = victim.humanoid
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = 0
	end

	if attacker == victim then
		attacker = nil
	elseif not attacker then
		-- Düşerek ya da kendi bombasıyla ölenin leşi, onu en son vurana yazılır
		local latest = 0
		for other, record in pairs(victim.damagers) do
			if now - record.time < 8 and record.time > latest and not other.removed then
				attacker, latest = other, record.time
			end
		end
	end
	if attacker and attacker.removed then
		attacker = nil
	end

	local def = info.weaponId and Weapons.Defs[info.weaponId]
	local weaponName = info.weaponName or (def and def.name) or "Kaza"

	if attacker then
		attacker.kills += 1
		attacker.streak += 1
		Combat.award(attacker, Config.Xp.kill, "Düşman etkisiz")
		if info.headshot then
			Combat.award(attacker, Config.Xp.headshot, "Kafadan vuruş")
		end
		if info.melee then
			Combat.award(attacker, Config.Xp.melee, "Bıçakla")
		end
		if info.distance and info.distance >= Config.LongshotDistance then
			Combat.award(
				attacker,
				Config.Xp.longshot,
				string.format("Uzak atış · %d m", math.floor(info.distance / 3.5))
			)
		end
		if attacker.lastKiller == victim then
			attacker.lastKiller = nil
			Combat.award(attacker, Config.Xp.revenge, "İntikam")
		end
		if attacker.streak % 3 == 0 then
			Combat.award(attacker, Config.Xp.streak, attacker.streak .. " leşlik seri")
			if attacker.streak >= 6 then
				Combat.announce(
					attacker.name .. " durdurulamıyor: " .. attacker.streak .. " leşlik seri!",
					attacker.team
				)
			end
		end
		if attacker.player then
			local data = PlayerData.get(attacker.player)
			if data then
				data.kills += 1
				if info.headshot then
					data.headshots += 1
				end
				PlayerData.touch(attacker.player)
			end
			if info.weaponId then
				PlayerData.addWeaponKill(attacker.player, info.weaponId)
			end
		end
		victim.lastKiller = attacker
	end

	for other, record in pairs(victim.damagers) do
		if
			other ~= attacker
			and other ~= victim
			and not other.removed
			and now - record.time < 10
			and record.amount >= 25
		then
			other.assists += 1
			Combat.award(other, Config.Xp.assist, "Asist")
		end
	end
	victim.damagers = {}

	if victim.player then
		local data = PlayerData.get(victim.player)
		if data then
			data.deaths += 1
			PlayerData.touch(victim.player)
		end
		Remotes.Died:FireClient(victim.player, {
			killer = attacker and attacker.name or nil,
			killerCharacter = attacker and attacker.character or nil,
			weapon = weaponName,
			headshot = info.headshot == true,
			respawn = Config.RespawnDelay,
		})
		Combat.pushProfile(victim.player)
	end

	Entities.syncRow(victim)
	if attacker then
		Entities.syncRow(attacker)
	end

	Remotes.KillFeed:FireAllClients({
		killer = attacker and attacker.name or nil,
		killerTeam = attacker and attacker.team or nil,
		victim = victim.name,
		victimTeam = victim.team,
		weapon = weaponName,
		headshot = info.headshot == true,
	})

	Combat.Killed:Fire({
		victim = victim,
		killer = attacker,
		weaponId = info.weaponId,
		headshot = info.headshot == true,
		melee = info.melee == true,
	})

	-- Ceset bir süre sonra kaldırılır
	local character = victim.character
	task.delay(Config.RespawnDelay + 2, function()
		if not character then
			return
		end
		if victim.character == character then
			if victim.alive then
				return
			end
			Entities.clearCharacter(victim)
		end
		if character.Parent then
			character:Destroy()
		end
	end)
end

-- info: { weaponId, weaponName, headshot, melee, distance, position }
function Combat.damage(attacker, victim, amount, info)
	if not Combat.enabled or not victim.alive or not victim.humanoid then
		return false, false
	end
	info = info or {}
	local now = os.clock()
	if victim.protectedUntil > now then
		return false, false
	end
	if attacker and attacker ~= victim and not Entities.isEnemy(attacker, victim) then
		return false, false
	end

	amount = math.max(0, amount)
	victim.lastDamageTime = now
	if attacker and attacker ~= victim then
		local record = victim.damagers[attacker]
		if not record then
			record = { amount = 0, time = now }
			victim.damagers[attacker] = record
		end
		record.amount += amount
		record.time = now
	end

	local humanoid = victim.humanoid
	local health = humanoid.Health - amount
	local killed = health <= 0

	if victim.player then
		local from = info.position or (attacker and Entities.position(attacker)) or nil
		Remotes.Damaged:FireClient(victim.player, from, amount)
	end
	if victim.onDamaged then
		victim.onDamaged(attacker)
	end
	if attacker and attacker.player and attacker ~= victim then
		Remotes.HitConfirm:FireClient(attacker.player, {
			damage = math.floor(amount + 0.5),
			headshot = info.headshot == true,
			killed = killed,
		})
	end

	if killed then
		Combat.kill(victim, attacker, info)
	else
		humanoid.Health = health
	end
	return true, killed
end

local function finishReload(weapon)
	local take = math.min(weapon.stats.magSize - weapon.mag, weapon.reserve)
	weapon.mag += take
	weapon.reserve -= take
	weapon.reloadEnd = nil
end

local function broadcastShot(entity, weaponId, endpoints, suppressed)
	local character = entity.character
	for _, player in ipairs(Players:GetPlayers()) do
		if player ~= entity.player then
			Remotes.ShotFx:FireClient(player, character, weaponId, endpoints, suppressed)
		end
	end
end
Combat.broadcastShot = broadcastShot

local function onFire(player, weaponId, origin, shots)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or not Combat.enabled then
		return
	end
	if type(weaponId) ~= "string" or typeof(origin) ~= "Vector3" or type(shots) ~= "table" then
		return
	end
	local weapon = entity.weapons[weaponId]
	if not weapon or weapon.stats.melee then
		return
	end
	local stats = weapon.stats
	local now = os.clock()

	if weapon.reloadEnd then
		if now < weapon.reloadEnd then
			return
		end
		finishReload(weapon)
	end
	if weapon.mag <= 0 then
		return
	end

	-- Atış hızı: jeton kovası (ağ gecikmesindeki dalgalanmaya tahammül eder)
	local interval = 60 / stats.rpm
	weapon.tokens = math.min(3, weapon.tokens + (now - weapon.lastToken) / interval)
	weapon.lastToken = now
	if weapon.tokens < 1 then
		return
	end
	weapon.tokens -= 1
	weapon.mag -= 1

	local head = Entities.headPosition(entity)
	if not head or (head - origin).Magnitude > 14 then
		return
	end

	entity.protectedUntil = 0
	entity.currentWeapon = weaponId

	local endpoints = {}
	local totals = {}
	local count = math.min(#shots, stats.pellets)
	for index = 1, count do
		local shot = shots[index]
		if type(shot) ~= "table" or typeof(shot.pos) ~= "Vector3" or typeof(shot.dir) ~= "Vector3" then
			continue
		end
		local position = shot.pos
		local offset = position - origin
		local distance = offset.Magnitude
		if distance > stats.range + 5 or distance < 0.01 then
			continue
		end
		table.insert(endpoints, position)

		local part = shot.part
		if typeof(part) ~= "Instance" or not part:IsA("BasePart") then
			continue
		end
		local victim = Entities.fromPart(part)
		if not victim or not victim.alive or not Entities.isEnemy(entity, victim) then
			continue
		end
		if shot.dir.Magnitude < 0.5 or offset.Unit:Dot(shot.dir.Unit) < 0.97 then
			continue
		end
		if (part.Position - position).Magnitude > part.Size.Magnitude / 2 + 8 then
			continue
		end
		if Combat.blocked(origin, position) then
			continue
		end

		local damage, zone = Ballistics.damageFor(stats, distance, part.Name)
		local total = totals[victim]
		if not total then
			total = { damage = 0, headshot = false, distance = distance }
			totals[victim] = total
		end
		total.damage += damage
		total.headshot = total.headshot or zone == "head"
	end

	for victim, total in pairs(totals) do
		Combat.damage(entity, victim, total.damage, {
			weaponId = weaponId,
			headshot = total.headshot,
			distance = total.distance,
		})
	end

	broadcastShot(entity, weaponId, endpoints, stats.suppressed)
end

local function onReload(player, weaponId)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or type(weaponId) ~= "string" then
		return
	end
	local weapon = entity.weapons[weaponId]
	if not weapon or weapon.stats.melee or weapon.reloadEnd then
		return
	end
	if weapon.mag >= weapon.stats.magSize or weapon.reserve <= 0 then
		return
	end
	weapon.reloadEnd = os.clock() + weapon.stats.reloadTime * 0.88
end

local function onEquip(player, weaponId)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or type(weaponId) ~= "string" then
		return
	end
	if not entity.weapons[weaponId] or entity.currentWeapon == weaponId then
		return
	end
	local now = os.clock()
	if entity.lastEquip and now - entity.lastEquip < 0.15 then
		return
	end
	entity.lastEquip = now
	for _, weapon in pairs(entity.weapons) do
		weapon.reloadEnd = nil
	end
	entity.currentWeapon = weaponId
	Spawner.equipWorld(entity, weaponId)
end

local function onMelee(player, part)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or not Combat.enabled then
		return
	end
	if not entity.weapons[Weapons.Melee] then
		return
	end
	local now = os.clock()
	if entity.lastMelee and now - entity.lastMelee < 0.45 then
		return
	end
	entity.lastMelee = now
	entity.protectedUntil = 0
	if typeof(part) ~= "Instance" or not part:IsA("BasePart") then
		return
	end
	local victim = Entities.fromPart(part)
	if not victim or not victim.alive or not Entities.isEnemy(entity, victim) then
		return
	end
	local a, b = Entities.position(entity), Entities.position(victim)
	if not a or not b or (a - b).Magnitude > Config.MeleeRange + 6 then
		return
	end
	Combat.damage(entity, victim, Weapons.Defs[Weapons.Melee].damage, { weaponId = Weapons.Melee, melee = true })
end

function Combat.explode(entity, position)
	Remotes.Blast:FireAllClients(position)
	for _, victim in ipairs(table.clone(Entities.list)) do
		if not victim.alive then
			continue
		end
		if victim ~= entity and not Entities.isEnemy(entity, victim) then
			continue
		end
		local root = Entities.rootPart(victim)
		if not root then
			continue
		end
		local distance = (root.Position - position).Magnitude
		if distance >= Config.GrenadeRadius then
			continue
		end
		if Combat.blocked(position + Vector3.new(0, 1.5, 0), root.Position) then
			continue
		end
		local damage = Config.GrenadeDamage * (1 - distance / Config.GrenadeRadius)
		local info = { weaponName = "El Bombası", position = position }
		if victim == entity then
			Combat.damage(nil, victim, damage * 0.6, info)
		else
			Combat.damage(not entity.removed and entity or nil, victim, damage, info)
		end
	end
end

function Combat.throwGrenade(entity, origin, direction)
	local grenade = Instance.new("Part")
	grenade.Name = "Grenade"
	grenade.Shape = Enum.PartType.Ball
	grenade.Size = Vector3.new(1.1, 1.1, 1.1)
	grenade.Color = Color3.fromRGB(62, 74, 50)
	grenade.Material = Enum.Material.Metal
	grenade.CanQuery = false
	grenade.CustomPhysicalProperties = PhysicalProperties.new(3, 0.7, 0.35)
	grenade.CFrame = CFrame.new(origin + direction * 2.5)
	grenade.Parent = projectiles
	grenade.AssemblyLinearVelocity = direction * Config.GrenadeSpeed + Vector3.new(0, 12, 0)
	pcall(function()
		grenade:SetNetworkOwner(nil)
	end)
	task.delay(Config.GrenadeFuse, function()
		local position = grenade.Position
		grenade:Destroy()
		Combat.explode(entity, position)
	end)
end

local function onGrenade(player, origin, direction)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or not Combat.enabled then
		return
	end
	if typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" or direction.Magnitude < 0.5 then
		return
	end
	if entity.grenades <= 0 then
		return
	end
	local head = Entities.headPosition(entity)
	if not head or (head - origin).Magnitude > 14 then
		return
	end
	entity.grenades -= 1
	entity.protectedUntil = 0
	Combat.throwGrenade(entity, origin, direction.Unit)
end

local function onLook(player, pitch)
	local entity = Entities.byPlayer[player]
	if not entity or not entity.alive or not entity.character or type(pitch) ~= "number" or pitch ~= pitch then
		return
	end
	entity.character:SetAttribute("AimPitch", math.floor(math.clamp(pitch, -1.4, 1.4) * 50 + 0.5) / 50)
end

function Combat.init(mapData)
	losParams.FilterDescendantsInstances = { mapData.folder }

	projectiles = Instance.new("Folder")
	projectiles.Name = "Projectiles"
	projectiles.Parent = workspace

	Remotes.Fire.OnServerEvent:Connect(onFire)
	Remotes.Reload.OnServerEvent:Connect(onReload)
	Remotes.Equip.OnServerEvent:Connect(onEquip)
	Remotes.Melee.OnServerEvent:Connect(onMelee)
	Remotes.Grenade.OnServerEvent:Connect(onGrenade)
	Remotes.Look.OnServerEvent:Connect(onLook)

	Entities.CharacterDied:Connect(function(entity, character)
		if entity.alive and entity.character == character then
			Combat.kill(entity, nil, {})
		end
	end)

	-- Can yenileme
	task.spawn(function()
		local step = 0.25
		while true do
			task.wait(step)
			local now = os.clock()
			for _, entity in ipairs(Entities.list) do
				local humanoid = entity.humanoid
				if
					entity.alive
					and humanoid
					and humanoid.Health < humanoid.MaxHealth
					and now - entity.lastDamageTime > Config.RegenDelay
				then
					humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + Config.RegenPerSecond * step)
				end
			end
		end
	end)
end

return Combat
