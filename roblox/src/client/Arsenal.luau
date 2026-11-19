-- Silah denetleyicisi (istemci): ateş, nişan, tepme, dolum, silah değiştirme,
-- bıçak ve el bombası. Vuruşu bu ekranda görülen ışın belirler; sunucu
-- Combat modülünde denetler ve hasarı uygular.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ballistics = require(Shared.Ballistics)
local Config = require(Shared.Config)
local Util = require(Shared.Util)
local Weapons = require(Shared.Weapons)

local Effects = require(script.Parent.Effects)
local Movement = require(script.Parent.Movement)
local Sfx = require(script.Parent.Sfx)
local Viewmodel = require(script.Parent.Viewmodel)

local player = Players.LocalPlayer

local Arsenal = {}

Arsenal.weapons = {} -- sırayla: { id, stats, mag, reserve, vm }
Arsenal.index = 0
Arsenal.grenades = 0
Arsenal.aimAlpha = 0
Arsenal.scoped = false
Arsenal.bloom = 0
Arsenal.active = false
Arsenal.lastShot = 0
Arsenal.reloadStart = nil

local remotes
local character
local rng = Random.new()

local fireHeld = false
local aimHeld = false
local aimToggled = false
local pendingSemi = false
local burstLeft = 0
local nextShot = 0
local equipStart = 0
local equipTime = 0.35
local lastEquipIndex = 1
local lastMelee = 0
local lastGrenade = 0

local fovKick = 0
local pendingPitch = 0
local pendingYaw = 0
local recoveryBank = 0

local raycastParams = RaycastParams.new()
raycastParams.FilterType = Enum.RaycastFilterType.Exclude
raycastParams.IgnoreWater = true

local function camera()
	return workspace.CurrentCamera
end

function Arsenal.current()
	return Arsenal.weapons[Arsenal.index]
end

local function hideAll()
	for _, weapon in ipairs(Arsenal.weapons) do
		weapon.vm.model.Parent = nil
	end
end

function Arsenal.clear()
	Arsenal.active = false
	for _, weapon in ipairs(Arsenal.weapons) do
		weapon.vm.model:Destroy()
	end
	Arsenal.weapons = {}
	Arsenal.index = 0
	Arsenal.reloadStart = nil
	Arsenal.aimAlpha = 0
	Arsenal.scoped = false
	fireHeld = false
	aimHeld = false
	aimToggled = false
	pendingPitch, pendingYaw, recoveryBank = 0, 0, 0
	fovKick = 0
	UserInputService.MouseDeltaSensitivity = 1
	local cam = camera()
	if cam then
		cam.FieldOfView = Config.BaseFov
	end
end

-- payload: { weapons = { { id, attachments } }, grenades, tier }
function Arsenal.setup(payload, newCharacter)
	local keepIndex = character == newCharacter and Arsenal.index or 1
	local previous = {}
	if character == newCharacter then
		for _, weapon in ipairs(Arsenal.weapons) do
			previous[weapon.id] = weapon
		end
	end
	Arsenal.clear()
	character = newCharacter
	raycastParams.FilterDescendantsInstances = { character, camera(), Effects.folder() }

	local teamId = player:GetAttribute("TeamId")
	local team = Config.TeamById[teamId] or Config.Teams[1]
	for _, entry in ipairs(payload.weapons) do
		local stats = Weapons.resolve(entry.id, entry.attachments)
		if stats then
			local old = previous[entry.id]
			table.insert(Arsenal.weapons, {
				id = entry.id,
				stats = stats,
				mag = old and old.mag or stats.magSize,
				reserve = old and old.reserve or stats.reserve,
				vm = Viewmodel.build(stats, team.uniform),
			})
		end
	end
	Arsenal.grenades = payload.grenades or 0
	Arsenal.active = #Arsenal.weapons > 0
	Arsenal.index = 0
	lastEquipIndex = 1
	Arsenal.equip(math.min(keepIndex, #Arsenal.weapons), true)
end

function Arsenal.equip(index, silent)
	local weapon = Arsenal.weapons[index]
	if not weapon or index == Arsenal.index or not Arsenal.active then
		return
	end
	if Arsenal.index ~= 0 then
		lastEquipIndex = Arsenal.index
	end
	hideAll()
	Arsenal.index = index
	Arsenal.reloadStart = nil
	burstLeft = 0
	pendingSemi = false
	equipStart = os.clock()
	equipTime = weapon.stats.melee and 0.2 or math.clamp(weapon.stats.adsTime * 1.4, 0.25, 0.55)
	weapon.vm.model.Parent = camera()
	Movement.speedMult = weapon.stats.speedMult
	if not silent then
		Sfx.play2D("equip", 0.1)
	end
	remotes.Equip:FireServer(weapon.id)
end

function Arsenal.cycle(direction)
	local count = #Arsenal.weapons
	if count < 2 then
		return
	end
	Arsenal.equip((Arsenal.index - 1 + direction) % count + 1)
end

function Arsenal.swapLast()
	Arsenal.equip(lastEquipIndex)
end

local function equipped()
	return os.clock() - equipStart >= equipTime
end

function Arsenal.reload()
	local weapon = Arsenal.current()
	if not weapon or weapon.stats.melee or Arsenal.reloadStart then
		return
	end
	if weapon.mag >= weapon.stats.magSize or weapon.reserve <= 0 then
		return
	end
	Arsenal.reloadStart = os.clock()
	burstLeft = 0
	Sfx.play2D("reload", 0.05)
	remotes.Reload:FireServer(weapon.id)
end

local function finishReload(weapon)
	local take = math.min(weapon.stats.magSize - weapon.mag, weapon.reserve)
	weapon.mag += take
	weapon.reserve -= take
	Arsenal.reloadStart = nil
end

function Arsenal.reloadProgress()
	local weapon = Arsenal.current()
	if not weapon or not Arsenal.reloadStart then
		return nil
	end
	return (os.clock() - Arsenal.reloadStart) / weapon.stats.reloadTime
end

function Arsenal.setFire(down)
	fireHeld = down
	if down then
		pendingSemi = true
		local weapon = Arsenal.current()
		if weapon and weapon.stats.melee then
			Arsenal.melee()
		end
	end
end

function Arsenal.setAim(down)
	aimHeld = down
end

function Arsenal.toggleAim()
	aimToggled = not aimToggled
end

function Arsenal.wantsAim()
	return aimHeld or aimToggled
end

function Arsenal.firing()
	return fireHeld
end

function Arsenal.spread()
	local weapon = Arsenal.current()
	if not weapon or weapon.stats.melee then
		return 0
	end
	return Ballistics.spreadDegrees(weapon.stats, {
		aim = Arsenal.aimAlpha,
		moving = Movement.moving,
		crouching = Movement.crouched,
		airborne = Movement.airborne,
		bloom = Arsenal.bloom,
	})
end

local function isFfa()
	local state = ReplicatedStorage:FindFirstChild("State")
	return state ~= nil and state:GetAttribute("FFA") == true
end

local function isEnemyCharacter(model)
	if not model or model == character then
		return false
	end
	if isFfa() then
		return true
	end
	local theirs = model:GetAttribute("Team")
	return theirs ~= nil and theirs ~= player:GetAttribute("TeamId")
end

local function shoot(weapon)
	local stats = weapon.stats
	local cam = camera()
	local origin = cam.CFrame.Position
	local look = cam.CFrame.LookVector
	local degrees = Arsenal.spread()
	local shots = {}
	local muzzle = Viewmodel.muzzleCFrame(weapon.vm)

	for _ = 1, stats.pellets do
		local direction = Ballistics.spreadDirection(look, degrees, rng:NextNumber(), rng:NextNumber())
		local result = workspace:Raycast(origin, direction * stats.range, raycastParams)
		local hitPosition = result and result.Position or origin + direction * stats.range
		local hitModel = result and Util.characterFromPart(result.Instance) or nil
		table.insert(shots, {
			pos = hitPosition,
			dir = direction,
			part = result and hitModel and result.Instance or nil,
		})
		Effects.tracer(muzzle.Position, hitPosition, stats.pellets > 1 and 0.05 or 0.08)
		if result then
			local instance = result.Instance
			Effects.impact(
				hitPosition,
				result.Normal,
				hitModel ~= nil and isEnemyCharacter(hitModel),
				result.Material,
				instance:IsA("BasePart") and not instance:IsA("Terrain") and instance.Color or nil
			)
		end
	end

	weapon.mag -= 1
	Arsenal.lastShot = os.clock()
	remotes.Fire:FireServer(weapon.id, origin, shots)

	-- Tepme
	local recoilScale = (Movement.crouched and 0.82 or 1) * (1 - Arsenal.aimAlpha * 0.22)
	pendingPitch += math.rad(stats.recoilV) * recoilScale
	pendingYaw += math.rad(stats.recoilH) * recoilScale * (rng:NextNumber() * 2 - 0.85)
	Arsenal.bloom = math.min(stats.maxBloom, Arsenal.bloom + stats.bloom)
	Viewmodel.kick(weapon.vm, math.clamp(stats.recoilV / 1.2, 0.6, 2.2))

	if not stats.suppressed then
		Effects.flash(muzzle, stats.class == "Sniper" and 1.5 or (stats.class == "Shotgun" and 1.3 or 1))
	end
	-- Kovan (pompalı ve sürgülü tüfekte atıştan biraz sonra)
	local port = weapon.vm.port
	if port then
		local camFrame = cam.CFrame
		local function eject()
			if port.Parent then
				Effects.shell(port.Position, camFrame.RightVector, camFrame.UpVector, stats.class == "Shotgun")
			end
		end
		if stats.class == "Shotgun" or stats.class == "Sniper" then
			task.delay(0.35, eject)
		else
			eject()
		end
	end
	fovKick = math.min(fovKick + math.clamp(stats.recoilV * 0.5, 0.3, 2.5), 4)
	Sfx.play2D(stats.suppressed and "suppressed" or stats.sound, 0.06)
	Movement.onFire()
end

function Arsenal.melee()
	if not Arsenal.active or not character then
		return
	end
	local now = os.clock()
	if now - lastMelee < 0.6 then
		return
	end
	lastMelee = now
	local weapon = Arsenal.current()
	if weapon then
		if weapon.stats.melee then
			Viewmodel.slash(weapon.vm)
		else
			-- Hızlı bıçak: silahı bir an indir
			equipStart = now - equipTime * 0.2
		end
	end
	Sfx.play2D("knife", 0.1)

	local root = character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	local look = Util.flat(camera().CFrame.LookVector)
	look = look.Magnitude > 0 and look.Unit or root.CFrame.LookVector
	local best, bestDistance = nil, Config.MeleeRange
	for _, model in ipairs(workspace:GetChildren()) do
		if model:IsA("Model") and isEnemyCharacter(model) then
			local humanoid = model:FindFirstChildOfClass("Humanoid")
			local theirRoot = model:FindFirstChild("HumanoidRootPart")
			if humanoid and humanoid.Health > 0 and theirRoot then
				local offset = theirRoot.Position - root.Position
				local distance = offset.Magnitude
				if distance < bestDistance and (distance < 2.5 or Util.flat(offset).Unit:Dot(look) > 0.35) then
					best, bestDistance = theirRoot, distance
				end
			end
		end
	end
	remotes.Melee:FireServer(best)
	if best then
		Effects.impact(best.Position, nil, true)
	end
end

function Arsenal.grenade()
	if not Arsenal.active or Arsenal.grenades <= 0 then
		return
	end
	local now = os.clock()
	if now - lastGrenade < 1 then
		return
	end
	lastGrenade = now
	Arsenal.grenades -= 1
	equipStart = now - equipTime * 0.1
	local cam = camera().CFrame
	local direction = (cam.LookVector + Vector3.new(0, 0.18, 0)).Unit
	remotes.Grenade:FireServer(cam.Position, direction)
	Sfx.play2D("equip", 0.2)
end

-- Her karede, kamera güncellendikten sonra çağrılır.
function Arsenal.update(dt)
	local cam = camera()
	local weapon = Arsenal.current()
	if not Arsenal.active or not weapon or not cam then
		return
	end
	local stats = weapon.stats
	local now = os.clock()

	-- Dolum
	if Arsenal.reloadStart and now - Arsenal.reloadStart >= stats.reloadTime then
		finishReload(weapon)
	end

	-- Nişan alma
	local canAim = not stats.melee and not Arsenal.reloadStart and not Movement.sprinting and equipped()
	local wantAim = Arsenal.wantsAim() and canAim
	local rate = dt / math.max(stats.adsTime, 0.05)
	Arsenal.aimAlpha = math.clamp(Arsenal.aimAlpha + (wantAim and rate or -rate * 1.4), 0, 1)
	Movement.aiming = Arsenal.aimAlpha > 0.3

	-- Ateş
	if fireHeld and Movement.sprinting then
		Movement.cancelSprint()
	end
	local ready = equipped() and not Arsenal.reloadStart and not stats.melee and not Movement.sprinting
	if ready then
		local interval = 60 / stats.rpm
		if weapon.mag <= 0 then
			if pendingSemi or (fireHeld and stats.fireMode == "auto") then
				pendingSemi = false
				if weapon.reserve > 0 then
					Arsenal.reload()
				elseif now >= nextShot then
					nextShot = now + 0.3
					Sfx.play2D("empty")
				end
			end
		elseif stats.fireMode == "auto" then
			if fireHeld then
				if nextShot < now - interval then
					nextShot = now
				end
				local fired = 0
				while nextShot <= now and weapon.mag > 0 and fired < 3 do
					shoot(weapon)
					nextShot += interval
					fired += 1
				end
			end
		elseif stats.fireMode == "burst" then
			if pendingSemi and burstLeft == 0 and now >= nextShot then
				burstLeft = stats.burstCount or 3
			end
			pendingSemi = false
			if burstLeft > 0 and now >= nextShot then
				shoot(weapon)
				burstLeft -= 1
				nextShot = now + (burstLeft > 0 and interval or stats.burstDelay or 0.25)
				if weapon.mag <= 0 then
					burstLeft = 0
				end
			end
		else
			if pendingSemi and now >= nextShot then
				pendingSemi = false
				shoot(weapon)
				nextShot = now + interval
			end
		end
	end
	if pendingSemi and now - Arsenal.lastShot > 0.25 and not fireHeld then
		pendingSemi = false
	end

	-- Dağılma sönümü
	Arsenal.bloom = math.max(0, Arsenal.bloom - dt * (stats.maxBloom * 2 + 1))

	-- Tepmeyi kameraya uygula; ateş kesilince bir kısmı geri gelir
	local apply = Util.smooth(28, dt)
	local dPitch = pendingPitch * apply
	local dYaw = pendingYaw * apply
	pendingPitch -= dPitch
	pendingYaw -= dYaw
	recoveryBank += dPitch * 0.5
	if now - Arsenal.lastShot > 0.14 and recoveryBank > 0 then
		local back = recoveryBank * Util.smooth(7, dt)
		recoveryBank -= back
		dPitch -= back
	end
	local shakePitch, shakeYaw = Effects.takeShake(dt)
	dPitch += shakePitch
	dYaw += shakeYaw
	if dPitch ~= 0 or dYaw ~= 0 then
		cam.CFrame = cam.CFrame * CFrame.Angles(dPitch, -dYaw, 0)
	end

	-- Görüş açısı ve hassasiyet
	local hipFov = Config.BaseFov + (Movement.sprinting and 6 or 0)
	fovKick -= fovKick * Util.smooth(14, dt)
	cam.FieldOfView = Util.lerp(hipFov, stats.adsFov, Arsenal.aimAlpha) + fovKick * (1 - Arsenal.aimAlpha * 0.7)
	UserInputService.MouseDeltaSensitivity =
		Util.lerp(1, math.max(stats.adsFov / Config.BaseFov, 0.25), Arsenal.aimAlpha)

	-- Dürbün: tam nişanda silah gizlenir, dürbün katmanı görünür
	local scoped = stats.scope == true and Arsenal.aimAlpha > 0.92
	if scoped ~= Arsenal.scoped then
		Arsenal.scoped = scoped
		weapon.vm.model.Parent = not scoped and cam or nil
	end

	Viewmodel.update(weapon.vm, cam.CFrame, {
		aim = Arsenal.aimAlpha,
		sprint = Movement.sprintAlpha,
		reload = Arsenal.reloadProgress(),
		equip = math.clamp((now - equipStart) / equipTime, 0, 1),
		moving = Movement.moving,
		airborne = Movement.airborne,
		mouseDelta = UserInputService:GetMouseDelta(),
	}, dt)
	local dropping = Viewmodel.takeDrop(weapon.vm)
	if dropping and stats.class ~= "Shotgun" then
		Effects.dropMag(dropping, cam.CFrame.UpVector * -3 + cam.CFrame.RightVector * -1)
	end
end

function Arsenal.init(remoteFolder)
	remotes = remoteFolder
end

return Arsenal
