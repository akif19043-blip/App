-- Birinci şahıs görünüm: kameranın önünde duran eller ve silah.
-- Model kamera klasöründe yaşar (yalnızca bu oyuncu görür) ve her karede
-- kameraya göre yeniden yerleştirilir: nişan alma, koşma, dolum, tepme,
-- yürüme sallantısı ve fare sallantısı burada birleşir.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GunModels = require(Shared.GunModels)
local Util = require(Shared.Util)

local Viewmodel = {}

-- Görünüm modeli küçültülür ve kameraya yaklaştırılır: aynı boyutta görünür
-- ama duvarların içine daha az girer.
local SCALE = 0.5
local EYE_DISTANCE = 0.8
local SKIN = Color3.fromRGB(214, 168, 130)
local GLOVE = Color3.fromRGB(40, 38, 34)

local WATCH = Color3.fromRGB(26, 26, 28)
local CUFF = 0.82 -- kol ağzı, kolun rengine göre koyuluk

local RIGHT_SHOULDER = Vector3.new(0.85, -1.5, 2.4)
local LEFT_SHOULDER = Vector3.new(-1.1, -1.6, 1.6)

local function armPart(model, name, size, cframe, color, material)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Parent = model
	return p
end

-- Sağ kol: kabzayı tutar, silahla birlikte sabit durur
local function addRightArm(model, info, sleeve)
	local hand, shoulder = info.rightHand, RIGHT_SHOULDER
	local offset = shoulder - hand
	local length = offset.Magnitude
	local direction = offset / length
	local sleeveLength = length - 0.3
	local mid = hand + direction * (0.3 + sleeveLength / 2)
	armPart(
		model,
		"Sleeve",
		Vector3.new(0.46, 0.46, sleeveLength),
		CFrame.lookAt(mid, shoulder),
		sleeve,
		Enum.Material.Fabric
	)
	armPart(
		model,
		"Cuff",
		Vector3.new(0.52, 0.52, 0.14),
		CFrame.lookAt(hand + direction * 0.36, shoulder),
		sleeve:Lerp(Color3.new(0, 0, 0), 1 - CUFF),
		Enum.Material.Fabric
	)
	armPart(
		model,
		"Hand",
		Vector3.new(0.34, 0.36, 0.5),
		CFrame.lookAt(hand + direction * 0.12, shoulder),
		GLOVE,
		Enum.Material.Fabric
	)
	armPart(
		model,
		"Wrist",
		Vector3.new(0.3, 0.3, 0.14),
		CFrame.lookAt(hand + direction * 0.4, shoulder),
		SKIN,
		Enum.Material.SmoothPlastic
	)

	-- Parmaklar: üçü kabzayı sarar, işaret parmağı tetik korkuluğunun yanında
	-- düz durur, başparmak gövdenin sol yanında
	if info.style == "knife" then
		for index = 0, 3 do
			armPart(
				model,
				"Finger",
				Vector3.new(0.22, 0.08, 0.08),
				CFrame.new(0.02, -0.11, -0.12 + index * 0.1),
				GLOVE,
				Enum.Material.Fabric
			)
		end
		armPart(
			model,
			"Thumb",
			Vector3.new(0.07, 0.07, 0.2),
			CFrame.new(-0.1, 0.06, -0.08),
			GLOVE,
			Enum.Material.Fabric
		)
		return
	end
	local tilt = CFrame.Angles(math.rad(info.style == "pistol" and -12 or -14), 0, 0)
	local grip = CFrame.new(hand.X, hand.Y, hand.Z) * tilt
	for index = 0, 2 do
		armPart(
			model,
			"Finger",
			Vector3.new(0.25, 0.085, 0.11),
			grip * CFrame.new(0.02, 0.02 - index * 0.105, -0.17),
			GLOVE,
			Enum.Material.Fabric
		)
	end
	armPart(
		model,
		"Finger",
		Vector3.new(0.07, 0.07, 0.24),
		CFrame.new(0.115, -0.02, hand.Z - 0.3),
		GLOVE,
		Enum.Material.Fabric
	)
	armPart(
		model,
		"Thumb",
		Vector3.new(0.07, 0.075, 0.24),
		CFrame.new(-0.125, hand.Y + 0.26, hand.Z - 0.08),
		GLOVE,
		Enum.Material.Fabric
	)
end

-- Sol kol her karede yeniden yerleştirilir (dolumda şarjöre uzanır)
local function buildLeftArm(model, sleeve)
	local arm = {
		sleeve = armPart(model, "LeftSleeve", Vector3.new(0.46, 0.46, 1), CFrame.new(), sleeve, Enum.Material.Fabric),
		cuff = armPart(
			model,
			"LeftCuff",
			Vector3.new(0.52, 0.52, 0.14),
			CFrame.new(),
			sleeve:Lerp(Color3.new(0, 0, 0), 1 - CUFF),
			Enum.Material.Fabric
		),
		wrist = armPart(
			model,
			"LeftWrist",
			Vector3.new(0.3, 0.3, 0.16),
			CFrame.new(),
			SKIN,
			Enum.Material.SmoothPlastic
		),
		watch = armPart(model, "Watch", Vector3.new(0.34, 0.34, 0.09), CFrame.new(), WATCH, Enum.Material.Plastic),
		face = armPart(
			model,
			"WatchFace",
			Vector3.new(0.14, 0.04, 0.12),
			CFrame.new(),
			Color3.fromRGB(150, 170, 160),
			Enum.Material.Glass
		),
		hand = armPart(model, "LeftHand", Vector3.new(0.34, 0.3, 0.44), CFrame.new(), GLOVE, Enum.Material.Fabric),
		fingers = {},
		thumb = armPart(model, "LeftThumb", Vector3.new(0.07, 0.07, 0.22), CFrame.new(), GLOVE, Enum.Material.Fabric),
	}
	for index = 1, 4 do
		arm.fingers[index] =
			armPart(model, "LeftFinger", Vector3.new(0.07, 0.16, 0.08), CFrame.new(), GLOVE, Enum.Material.Fabric)
	end
	return arm
end

local function placeLeftArm(vm, handleCFrame, handPoint)
	local arm = vm.left
	local s = SCALE
	local shoulder = handleCFrame * vm.leftShoulder
	local hand = handleCFrame * handPoint
	local offset = shoulder - hand
	local length = math.max(offset.Magnitude, 0.05)
	local direction = offset / length
	local sleeveLength = math.max(length - 0.3 * s, 0.05)
	arm.sleeve.Size = Vector3.new(0.46 * s, 0.46 * s, sleeveLength)
	arm.sleeve.CFrame = CFrame.lookAt(hand + direction * (0.3 * s + sleeveLength / 2), shoulder)
	local wristFrame = CFrame.lookAt(hand + direction * 0.3 * s, shoulder)
	arm.cuff.CFrame = CFrame.lookAt(hand + direction * 0.4 * s, shoulder)
	arm.wrist.CFrame = wristFrame
	arm.watch.CFrame = wristFrame * CFrame.new(0, 0, -0.02 * s)
	arm.face.CFrame = wristFrame * CFrame.new(0, 0.18 * s, -0.02 * s)
	-- El silahın yönünde durur; parmaklar el kundağının sağ yanını sarar
	local handFrame = CFrame.new(hand) * (handleCFrame - handleCFrame.Position)
	arm.hand.CFrame = handFrame
	for index, finger in ipairs(arm.fingers) do
		finger.CFrame = handFrame * CFrame.new(0.15 * s, 0.1 * s, (-0.15 + (index - 1) * 0.1) * s)
	end
	arm.thumb.CFrame = handFrame * CFrame.new(-0.15 * s, 0.12 * s, 0)
end

function Viewmodel.build(stats, sleeveColor)
	local model, info = GunModels.build(stats, { name = "Viewmodel" })
	addRightArm(model, info, sleeveColor)
	local left
	if info.leftHand then
		left = buildLeftArm(model, sleeveColor)
	end
	for _, item in ipairs(model:GetDescendants()) do
		if item:IsA("BasePart") then
			item.CastShadow = false
			item.CanQuery = false
		end
	end
	model:ScaleTo(SCALE)

	local handle = model.PrimaryPart
	local mags = {}
	for _, item in ipairs(model:GetChildren()) do
		if item:IsA("BasePart") and item:GetAttribute("Mag") then
			table.insert(mags, item)
		end
	end
	if left then
		-- ScaleTo boyutları küçülttü; sol kolun parçaları her karede yeniden yerleşir
		for _, finger in ipairs(left.fingers) do
			finger.Size = Vector3.new(0.07, 0.16, 0.08) * SCALE
		end
	end

	local vm = {
		model = model,
		handle = handle,
		aim = handle:WaitForChild("Aim").Position,
		muzzle = handle:WaitForChild("Muzzle"),
		port = model:FindFirstChild("EjectionPort") or model:FindFirstChild("Slide") or model:FindFirstChild(
			"Receiver"
		),
		mags = mags,
		stats = stats,
		melee = stats.melee == true,
		left = left,
		leftRest = info.leftHand and info.leftHand * SCALE or nil,
		magPoint = (info.magPoint or info.leftHand or Vector3.zero) * SCALE,
		leftShoulder = LEFT_SHOULDER * SCALE,
		-- canlı durum
		kickZ = 0,
		kickPitch = 0,
		kickRoll = 0,
		swayX = 0,
		swayY = 0,
		bobTime = 0,
		slash = 0,
		dropped = false,
	}
	if left then
		placeLeftArm(vm, handle.CFrame, vm.leftRest)
	end
	return vm
end

local function smoothstep(t)
	t = math.clamp(t, 0, 1)
	return t * t * (3 - 2 * t)
end

-- Dolum boyunca sol elin silaha göre yeri: el kundağı → şarjör → cep → şarjör → el kundağı
local function reloadHand(vm, t)
	local rest, mag = vm.leftRest, vm.magPoint
	local pouch = mag + Vector3.new(-0.1, -0.75, 0.3) * SCALE
	local seat = mag + Vector3.new(0, 0.08, 0) * SCALE
	if t < 0.15 then
		return rest:Lerp(mag, smoothstep(t / 0.15))
	elseif t < 0.3 then
		return mag:Lerp(mag + Vector3.new(0, -0.15, 0) * SCALE, smoothstep((t - 0.15) / 0.15))
	elseif t < 0.48 then
		return (mag + Vector3.new(0, -0.15, 0) * SCALE):Lerp(pouch, smoothstep((t - 0.3) / 0.18))
	elseif t < 0.66 then
		return pouch:Lerp(seat, smoothstep((t - 0.48) / 0.18))
	elseif t < 0.8 then
		return seat:Lerp(mag, smoothstep((t - 0.66) / 0.14))
	end
	return mag:Lerp(rest, smoothstep((t - 0.8) / 0.2))
end

function Viewmodel.kick(vm, strength)
	vm.kickZ += 0.12 * strength
	vm.kickPitch += math.rad(2.4) * strength
	vm.kickRoll += math.rad((math.random() - 0.5) * 3) * strength
end

function Viewmodel.slash(vm)
	vm.slash = 1
end

local HIP = CFrame.new(0.6, -0.62, -1.35)
local SPRINT = CFrame.new(0.3, -0.6, -1.1) * CFrame.Angles(math.rad(-12), math.rad(48), math.rad(12))
local KNIFE = CFrame.new(0.7, -0.75, -1.4) * CFrame.Angles(math.rad(8), math.rad(-12), math.rad(-14))

-- s: { aim, sprint, reload (0..1 ya da nil), equip (0..1), moving (0..1),
--      mouseDelta (Vector2), airborne }
function Viewmodel.update(vm, cameraCFrame, s, dt)
	local k = Util.smooth(14, dt)
	vm.kickZ -= vm.kickZ * Util.smooth(18, dt)
	vm.kickPitch -= vm.kickPitch * Util.smooth(16, dt)
	vm.kickRoll -= vm.kickRoll * Util.smooth(12, dt)
	vm.slash = math.max(0, vm.slash - dt / 0.32)

	local aim = s.aim
	local delta = s.mouseDelta or Vector2.zero
	local swayScale = 1 - aim * 0.8
	vm.swayX += (math.clamp(-delta.X * 0.0016, -0.08, 0.08) * swayScale - vm.swayX) * k
	vm.swayY += (math.clamp(-delta.Y * 0.0016, -0.08, 0.08) * swayScale - vm.swayY) * k

	vm.bobTime += dt * (6 + s.sprint * 4) * s.moving
	local bobAmount = s.moving * (1 - aim * 0.85) * (0.035 + s.sprint * 0.05)
	local bob = CFrame.new(math.sin(vm.bobTime) * bobAmount, -math.abs(math.cos(vm.bobTime)) * bobAmount, 0)

	local base
	if vm.melee then
		local swing = math.sin(vm.slash * math.pi)
		base = KNIFE
			* CFrame.new(-0.6 * swing, 0.2 * swing, -0.4 * swing)
			* CFrame.Angles(math.rad(-30) * swing, math.rad(70) * swing, math.rad(40) * swing)
	else
		local aimFrame = CFrame.new(-vm.aim.X, -vm.aim.Y, -vm.aim.Z - EYE_DISTANCE)
		base = HIP:Lerp(aimFrame, aim)
		if s.sprint > 0 then
			base = base:Lerp(SPRINT, s.sprint)
		end
	end

	if s.reload then
		local r = math.sin(math.clamp(s.reload, 0, 1) * math.pi)
		base = base
			* CFrame.new(0, -0.18 * r, 0.1 * r)
			* CFrame.Angles(math.rad(-18) * r, math.rad(-20) * r, math.rad(38) * r)
		-- Boş şarjör çekilince düşer, yenisi takılınca görünür
		local hidden = s.reload > 0.28 and s.reload < 0.64
		if hidden and not vm.dropped then
			vm.dropped = true
			vm.dropNow = true
		end
		for _, mag in ipairs(vm.mags) do
			mag.LocalTransparencyModifier = hidden and 1 or 0
		end
	elseif vm.dropped then
		vm.dropped = false
		for _, mag in ipairs(vm.mags) do
			mag.LocalTransparencyModifier = 0
		end
	end

	local lowered = 1 - s.equip
	if lowered > 0 then
		base = CFrame.new(0, -0.9 * lowered, 0.2 * lowered) * base * CFrame.Angles(math.rad(-50) * lowered, 0, 0)
	end
	if s.airborne then
		base = CFrame.new(0, -0.05, 0) * base
	end

	local sway = CFrame.Angles(vm.swayY, vm.swayX, vm.swayX * 0.6)
	local kick = CFrame.new(0, 0, vm.kickZ * (1 - aim * 0.4))
		* CFrame.Angles(vm.kickPitch * (1 - aim * 0.5), 0, vm.kickRoll)
	vm.model:PivotTo(cameraCFrame * sway * bob * base * kick)
	if vm.left then
		placeLeftArm(vm, vm.handle.CFrame, s.reload and reloadHand(vm, s.reload) or vm.leftRest)
	end
end

-- Dolumda düşecek şarjörün parçaları (Arsenal, Effects.dropMag'e verir)
function Viewmodel.takeDrop(vm)
	if vm.dropNow then
		vm.dropNow = false
		return vm.mags
	end
	return nil
end

function Viewmodel.muzzleCFrame(vm)
	return vm.muzzle.WorldCFrame
end

return Viewmodel
