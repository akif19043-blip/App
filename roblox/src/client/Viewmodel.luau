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

local function addArm(model, hand, shoulder, sleeve)
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
end

function Viewmodel.build(stats, sleeveColor)
	local model, info = GunModels.build(stats, { name = "Viewmodel" })
	addArm(model, info.rightHand, Vector3.new(0.85, -1.5, 2.4), sleeveColor)
	if info.leftHand then
		addArm(model, info.leftHand, Vector3.new(-1.1, -1.6, 1.6), sleeveColor)
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

	return {
		model = model,
		handle = handle,
		aim = handle:WaitForChild("Aim").Position,
		muzzle = handle:WaitForChild("Muzzle"),
		mags = mags,
		stats = stats,
		melee = stats.melee == true,
		-- canlı durum
		kickZ = 0,
		kickPitch = 0,
		kickRoll = 0,
		swayX = 0,
		swayY = 0,
		bobTime = 0,
		slash = 0,
	}
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
		local hidden = s.reload > 0.3 and s.reload < 0.62
		for _, mag in ipairs(vm.mags) do
			mag.LocalTransparencyModifier = hidden and 1 or 0
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
end

function Viewmodel.muzzleCFrame(vm)
	return vm.muzzle.WorldCFrame
end

return Viewmodel
