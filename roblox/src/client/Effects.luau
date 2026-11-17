-- Görsel efektler: mermi izi, namlu ateşi, isabet izi, patlama. Ayrıca başka
-- oyuncuların ateşini (ShotFx) çizer ve gövdelerini nişan yönüne eğer.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Weapons = require(Shared.Weapons)

local Sfx = require(script.Parent.Sfx)

local Effects = {}

-- Radar için: karakter -> son duyulan atış zamanı
Effects.heardAt = setmetatable({}, { __mode = "k" })
Effects.blasts = {}

local folder
local holes = {}
local MAX_HOLES = 60

local TRACER = Color3.fromRGB(255, 226, 150)
local FLASH = Color3.fromRGB(255, 196, 96)

local function part(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.Neon
	for key, value in pairs(props) do
		p[key] = value
	end
	p.Parent = folder
	return p
end

function Effects.tracer(from, to, width)
	local offset = to - from
	local length = offset.Magnitude
	if length < 2 then
		return
	end
	-- İz, mesafenin bir kısmını kaplayan kısa bir çizgi olarak uçar
	local streak = math.min(length * 0.6, 26)
	local p = part({
		Size = Vector3.new(width or 0.08, width or 0.08, streak),
		Color = TRACER,
		Transparency = 0.15,
	})
	local direction = offset / length
	local startTime = os.clock()
	local speed = 1400
	local travel = math.max(0.03, length / speed)
	local connection
	connection = RunService.RenderStepped:Connect(function()
		local t = (os.clock() - startTime) / travel
		if t >= 1 or not p.Parent then
			connection:Disconnect()
			p:Destroy()
			return
		end
		local head = from + direction * (length * t)
		local tail = head - direction * math.min(streak, length * t + 0.1)
		p.Size = Vector3.new(p.Size.X, p.Size.Y, math.max((head - tail).Magnitude, 0.1))
		p.CFrame = CFrame.lookAt((head + tail) / 2, head)
	end)
end

function Effects.flash(cframe, scale)
	scale = scale or 1
	local p = part({
		Size = Vector3.new(0.5, 0.5, 0.9) * scale,
		Color = FLASH,
		Transparency = 0.1,
		CFrame = cframe * CFrame.Angles(0, 0, math.random() * math.pi),
	})
	p.Shape = Enum.PartType.Ball
	local light = Instance.new("PointLight")
	light.Color = FLASH
	light.Brightness = 3
	light.Range = 12 * scale
	light.Parent = p
	task.delay(0.045, function()
		p:Destroy()
	end)
end

local function emitter(at, color, count, speed, size, lifetime)
	local anchor = Instance.new("Attachment")
	anchor.WorldPosition = at
	anchor.Parent = workspace.Terrain
	local e = Instance.new("ParticleEmitter")
	e.Color = ColorSequence.new(color)
	e.Size = NumberSequence.new(size, size * 0.2)
	e.Transparency = NumberSequence.new(0.1, 1)
	e.Lifetime = NumberRange.new(lifetime * 0.5, lifetime)
	e.Speed = NumberRange.new(speed * 0.4, speed)
	e.SpreadAngle = Vector2.new(60, 60)
	e.Acceleration = Vector3.new(0, -30, 0)
	e.LightEmission = 0.2
	e.Enabled = false
	e.Parent = anchor
	e:Emit(count)
	task.delay(lifetime + 0.2, function()
		anchor:Destroy()
	end)
end

function Effects.impact(position, normal, hitCharacter)
	if hitCharacter then
		emitter(position, Color3.fromRGB(150, 20, 20), 8, 10, 0.35, 0.35)
		return
	end
	emitter(position, Color3.fromRGB(196, 176, 140), 6, 12, 0.4, 0.45)
	if normal then
		local hole = part({
			Size = Vector3.new(0.32, 0.32, 0.05),
			Color = Color3.fromRGB(26, 24, 22),
			Material = Enum.Material.SmoothPlastic,
			CFrame = CFrame.lookAt(position + normal * 0.02, position + normal * 2),
		})
		table.insert(holes, hole)
		if #holes > MAX_HOLES then
			table.remove(holes, 1):Destroy()
		end
	end
end

function Effects.blast(position)
	local explosion = Instance.new("Explosion")
	explosion.Position = position
	explosion.BlastPressure = 0
	explosion.BlastRadius = 0
	explosion.DestroyJointRadiusPercent = 0
	explosion.ExplosionType = Enum.ExplosionType.NoCraters
	explosion.Parent = workspace
	emitter(position, Color3.fromRGB(90, 84, 76), 30, 30, 2.4, 1.2)
	Sfx.play3D("explosion", position, 0.1)
	table.insert(Effects.blasts, { position = position, time = os.clock() })
end

local function muzzleOf(character)
	local gun = character and character:FindFirstChild("WorldGun")
	local handle = gun and gun.PrimaryPart
	local muzzle = handle and handle:FindFirstChild("Muzzle")
	if muzzle then
		return muzzle.WorldCFrame
	end
	local head = character and character:FindFirstChild("Head")
	return head and head.CFrame or nil
end

-- Başkasının ateşi
function Effects.remoteShot(character, weaponId, endpoints, suppressed)
	local muzzle = muzzleOf(character)
	if not muzzle or typeof(endpoints) ~= "table" then
		return
	end
	local def = Weapons.Defs[weaponId]
	if not suppressed then
		Effects.flash(muzzle, def and def.class == "Sniper" and 1.6 or 1)
		Effects.heardAt[character] = os.clock()
	end
	Sfx.play3D(suppressed and "suppressed" or (def and def.sound or "rifle"), muzzle.Position, 0.08)
	for _, point in ipairs(endpoints) do
		if typeof(point) == "Vector3" then
			Effects.tracer(muzzle.Position, point)
		end
	end
end

-- Başkalarının gövdesini nişan açısına göre eğ (bel eklemi)
local waistBase = setmetatable({}, { __mode = "k" })

local function updatePoses()
	local mine = Players.LocalPlayer.Character
	for _, character in ipairs(workspace:GetChildren()) do
		if character ~= mine and character:IsA("Model") then
			local pitch = character:GetAttribute("AimPitch")
			if pitch then
				local upper = character:FindFirstChild("UpperTorso")
				local waist = upper and upper:FindFirstChild("Waist")
				if waist and waist:IsA("Motor6D") then
					local base = waistBase[waist]
					if not base then
						base = waist.C0
						waistBase[waist] = base
					end
					waist.C0 = base * CFrame.Angles(pitch * 0.7, 0, 0)
				end
			end
		end
	end
end

function Effects.init(remotes)
	folder = Instance.new("Folder")
	folder.Name = "Effects"
	folder.Parent = workspace

	remotes.ShotFx.OnClientEvent:Connect(Effects.remoteShot)
	remotes.Blast.OnClientEvent:Connect(Effects.blast)

	local accumulator = 0
	RunService.Heartbeat:Connect(function(dt)
		accumulator += dt
		if accumulator >= 0.1 then
			accumulator = 0
			updatePoses()
		end
	end)
end

function Effects.folder()
	return folder
end

return Effects
