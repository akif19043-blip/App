-- Hareket: koşma, eğilme ve kayma. Hız, Humanoid.WalkSpeed ile verilir
-- (karakterin fiziği oyuncunun kendi makinesinde çalışır).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Util = require(Shared.Util)

local Movement = {}

Movement.speedMult = 1
Movement.aiming = false
Movement.moving = 0
Movement.crouched = false
Movement.airborne = false
Movement.sprinting = false
Movement.sprintAlpha = 0

local humanoid
local root
local baseHipHeight = 2
local sprintHeld = false
local sprintToggled = false
local slideUntil = 0
local fireBlockUntil = 0
local cameraDrop = 0

function Movement.setup(newHumanoid)
	humanoid = newHumanoid
	root = humanoid.Parent and humanoid.Parent:FindFirstChild("HumanoidRootPart")
	baseHipHeight = humanoid.HipHeight
	Movement.crouched = false
	Movement.sprinting = false
	Movement.sprintAlpha = 0
	sprintToggled = false
	slideUntil = 0
	cameraDrop = 0
	humanoid.CameraOffset = Vector3.zero
	humanoid.WalkSpeed = Config.WalkSpeed
end

function Movement.clear()
	humanoid = nil
	root = nil
	Movement.sprinting = false
	Movement.crouched = false
end

function Movement.setSprint(down)
	sprintHeld = down
	if down then
		Movement.crouched = false
	end
end

function Movement.toggleSprint()
	sprintToggled = not sprintToggled
	if sprintToggled then
		Movement.crouched = false
	end
end

function Movement.cancelSprint()
	sprintToggled = false
	fireBlockUntil = os.clock() + 0.35
end

function Movement.onFire()
	fireBlockUntil = os.clock() + 0.35
	sprintToggled = false
end

function Movement.toggleCrouch()
	if not humanoid then
		return
	end
	if Movement.sprinting and not Movement.crouched then
		-- Koşarken eğilmek: kayma
		slideUntil = os.clock() + Config.SlideTime
		Movement.crouched = true
		sprintToggled = false
		return
	end
	Movement.crouched = not Movement.crouched
end

function Movement.update(dt, camera)
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local now = os.clock()

	local velocity = root and root.AssemblyLinearVelocity or Vector3.zero
	local flatSpeed = Util.flat(velocity).Magnitude
	Movement.moving = math.clamp(flatSpeed / Config.WalkSpeed, 0, 1)
	Movement.airborne = humanoid.FloorMaterial == Enum.Material.Air

	local moveDirection = humanoid.MoveDirection
	local look = Util.flat(camera.CFrame.LookVector)
	local forward = moveDirection.Magnitude > 0.1 and look.Magnitude > 0 and moveDirection.Unit:Dot(look.Unit) > 0.3

	local wantSprint = (sprintHeld or sprintToggled) and forward and not Movement.aiming and now > fireBlockUntil
	local sliding = now < slideUntil
	if wantSprint and Movement.crouched and not sliding then
		Movement.crouched = false
	end
	Movement.sprinting = wantSprint and not Movement.crouched
	Movement.sprintAlpha += ((Movement.sprinting and 1 or 0) - Movement.sprintAlpha) * Util.smooth(10, dt)

	local speed
	if sliding then
		local t = 1 - (slideUntil - now) / Config.SlideTime
		speed = Util.lerp(Config.SlideSpeed, Config.CrouchSpeed, t * t)
	elseif Movement.crouched then
		speed = Config.CrouchSpeed
	elseif Movement.sprinting then
		speed = Config.SprintSpeed
	else
		speed = Config.WalkSpeed
	end
	speed *= Movement.speedMult
	if Movement.aiming then
		speed *= Config.AimSpeedMult
	end
	humanoid.WalkSpeed = speed

	-- Eğilince kamera ve gövde alçalır (vuruş kutusu da küçülür)
	local targetDrop = Movement.crouched and Config.CrouchHipDrop or 0
	cameraDrop += (targetDrop - cameraDrop) * Util.smooth(12, dt)
	humanoid.CameraOffset = Vector3.new(0, -cameraDrop * 0.6, 0)
	local hip = baseHipHeight - (Movement.crouched and Config.CrouchHipDrop * 0.6 or 0)
	if math.abs(humanoid.HipHeight - hip) > 0.01 then
		humanoid.HipHeight = hip
	end
end

return Movement
