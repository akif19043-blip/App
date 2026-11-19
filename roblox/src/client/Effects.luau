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

-- Roblox'un kendi parçacık dokuları
local SPARK_TEXTURE = "rbxasset://textures/particles/sparkles_main.dds"
local SMOKE_TEXTURE = "rbxasset://textures/particles/smoke_main.dds"
local FIRE_TEXTURE = "rbxasset://textures/particles/fire_main.dds"

local shells = {}
local MAX_SHELLS = 24
local BRASS = Color3.fromRGB(196, 158, 72)

-- Kamera sarsıntısı (patlama, yakın isabet): Arsenal her karede tüketir
local shake = 0

-- Arazi malzemelerinin toz rengi
local DUST = {
	Sand = Color3.fromRGB(206, 182, 136),
	Ground = Color3.fromRGB(130, 108, 80),
	Grass = Color3.fromRGB(130, 124, 76),
	Mud = Color3.fromRGB(96, 80, 60),
	Rock = Color3.fromRGB(140, 128, 112),
	Sandstone = Color3.fromRGB(184, 150, 108),
	Asphalt = Color3.fromRGB(90, 90, 92),
	Pavement = Color3.fromRGB(160, 154, 142),
}
local METALLIC = {
	[Enum.Material.Metal] = true,
	[Enum.Material.CorrodedMetal] = true,
	[Enum.Material.DiamondPlate] = true,
}

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

-- options: texture, spread, gravity, light, grow (boyut sonda kaç katına çıkar),
-- direction (yayılma yönü), drag, rotate
local function emitter(at, color, count, speed, size, lifetime, options)
	options = options or {}
	local anchor = Instance.new("Attachment")
	anchor.Parent = workspace.Terrain
	if options.direction and options.direction.Magnitude > 0.01 then
		-- Parçacıklar bağlantının üst (Y) yönüne saçılır: Y'yi "direction"a çevir
		anchor.WorldCFrame = CFrame.lookAt(at, at + options.direction) * CFrame.Angles(math.rad(-90), 0, 0)
	else
		anchor.WorldPosition = at
	end
	local e = Instance.new("ParticleEmitter")
	e.Texture = options.texture or SPARK_TEXTURE
	e.Color = typeof(color) == "ColorSequence" and color or ColorSequence.new(color)
	e.Size = NumberSequence.new(size, size * (options.grow or 0.2))
	e.Transparency = NumberSequence.new(options.fadeFrom or 0.1, 1)
	e.Lifetime = NumberRange.new(lifetime * 0.5, lifetime)
	e.Speed = NumberRange.new(speed * 0.4, speed)
	e.SpreadAngle = Vector2.new(options.spread or 60, options.spread or 60)
	e.Acceleration = options.accel or Vector3.new(0, options.gravity or -30, 0)
	e.Drag = options.drag or 0
	e.LightEmission = options.light or 0.2
	e.LightInfluence = options.light and options.light > 0.5 and 0 or 1
	e.Rotation = NumberRange.new(0, 360)
	e.RotSpeed = NumberRange.new(-(options.rotate or 0), options.rotate or 0)
	e.EmissionDirection = Enum.NormalId.Top
	e.Enabled = false
	e.Parent = anchor
	e:Emit(count)
	task.delay(lifetime + 0.3, function()
		anchor:Destroy()
	end)
end

-- Namlu ateşi: çapraz iki parlak yaprak, kısa ışık, kıvılcım ve duman
function Effects.flash(cframe, scale, quiet)
	scale = scale or 1
	local spin = CFrame.Angles(0, 0, math.random() * math.pi)
	local created = {}
	for index = 0, 1 do
		created[#created + 1] = part({
			Size = Vector3.new(0.06, 0.55 * scale, 1.1 * scale),
			Color = FLASH,
			Transparency = 0.15,
			CFrame = cframe * spin * CFrame.Angles(0, 0, index * math.pi / 2) * CFrame.new(0, 0, -0.45 * scale),
		})
	end
	local core = part({
		Size = Vector3.new(0.35, 0.35, 0.35) * scale,
		Color = Color3.fromRGB(255, 236, 180),
		Transparency = 0.05,
		CFrame = cframe,
		Shape = Enum.PartType.Ball,
	})
	local light = Instance.new("PointLight")
	light.Color = FLASH
	light.Brightness = 4
	light.Range = 14 * scale
	light.Shadows = false
	light.Parent = core
	created[#created + 1] = core
	task.delay(0.045, function()
		for _, item in ipairs(created) do
			item:Destroy()
		end
	end)
	if not quiet then
		local forward = cframe.LookVector
		emitter(
			cframe.Position,
			FLASH,
			4,
			18,
			0.12 * scale,
			0.12,
			{ direction = forward, spread = 25, gravity = 0, light = 1 }
		)
		emitter(cframe.Position + forward * 0.3, Color3.fromRGB(190, 186, 176), 2, 3, 0.6 * scale, 0.9, {
			texture = SMOKE_TEXTURE,
			direction = forward,
			spread = 20,
			gravity = 2,
			grow = 3,
			fadeFrom = 0.55,
			drag = 2,
			rotate = 40,
		})
	end
end

-- Kovan: silahın atım penceresinden sağa ve yukarı fırlar, yere düşüp kaybolur
function Effects.shell(position, right, up, shotgun)
	local casing = Instance.new("Part")
	casing.Name = "Casing"
	casing.Shape = Enum.PartType.Cylinder
	casing.Size = shotgun and Vector3.new(0.3, 0.14, 0.14) or Vector3.new(0.16, 0.07, 0.07)
	casing.Color = shotgun and Color3.fromRGB(170, 40, 34) or BRASS
	casing.Material = Enum.Material.Metal
	casing.CanQuery = false
	casing.CanTouch = false
	casing.CastShadow = false
	casing.CFrame = CFrame.lookAt(position, position + right) * CFrame.Angles(0, math.rad(90), 0)
	casing.Parent = folder
	casing.AssemblyLinearVelocity = right * (9 + math.random() * 4) + up * (5 + math.random() * 3)
	casing.AssemblyAngularVelocity = Vector3.new(math.random() * 30, math.random() * 30, math.random() * 30)
	table.insert(shells, casing)
	if #shells > MAX_SHELLS then
		local old = table.remove(shells, 1)
		if old.Parent then
			old:Destroy()
		end
	end
	task.delay(2.5, function()
		if casing.Parent then
			casing:Destroy()
		end
	end)
end

-- Yerde rüzgârla savrulan toz bulutu
function Effects.gust(position, wind)
	local flat = Vector3.new(wind.X, 0, wind.Z)
	emitter(position, DUST.Sand, 3, 3, 3.2, 3, {
		texture = SMOKE_TEXTURE,
		direction = flat.Magnitude > 0 and flat or nil,
		spread = 25,
		accel = flat * 0.35 + Vector3.new(0, 0.3, 0),
		grow = 2.4,
		fadeFrom = 0.8,
		drag = 0.4,
		rotate = 20,
	})
end

-- Boş şarjör: görünümdeki şarjör parçalarının kopyası yere düşer
function Effects.dropMag(parts, push)
	for _, source in ipairs(parts) do
		local piece = source:Clone()
		piece.Name = "DroppedMag"
		piece.Anchored = false
		piece.CanCollide = true
		piece.CanQuery = false
		piece.LocalTransparencyModifier = 0
		piece.Transparency = 0
		piece.CFrame = source.CFrame
		piece.Parent = folder
		piece.AssemblyLinearVelocity = push or Vector3.new(0, -4, 0)
		piece.AssemblyAngularVelocity = Vector3.new(math.random() * 4, math.random() * 4, math.random() * 4)
		task.delay(4, function()
			if piece.Parent then
				piece:Destroy()
			end
		end)
	end
end

function Effects.addShake(amount)
	shake = math.min(1.5, shake + amount)
end

-- Bu karenin sarsıntı açısı (radyan) ve sönümü
function Effects.takeShake(dt)
	if shake <= 0.001 then
		shake = 0
		return 0, 0
	end
	local amount = shake * 0.02
	shake = math.max(0, shake - dt * 2.4)
	return (math.random() - 0.5) * amount, (math.random() - 0.5) * amount
end

-- material: isabet edilen yüzeyin malzemesi; color: parçanın rengi (arazide yok)
function Effects.impact(position, normal, hitCharacter, material, color)
	if hitCharacter then
		emitter(position, Color3.fromRGB(140, 16, 16), 10, 10, 0.35, 0.4, { direction = normal, spread = 50 })
		return
	end
	local direction = normal or Vector3.new(0, 1, 0)
	if material and METALLIC[material] then
		-- Metal: kıvılcım
		emitter(
			position,
			Color3.fromRGB(255, 210, 120),
			9,
			26,
			0.12,
			0.3,
			{ direction = direction, spread = 55, gravity = -60, light = 1 }
		)
	end
	local dust = (material and DUST[material.Name])
		or (color and color:Lerp(Color3.fromRGB(200, 190, 170), 0.3))
		or DUST.Sand
	emitter(position, dust, 5, 8, 0.5, 0.8, {
		texture = SMOKE_TEXTURE,
		direction = direction,
		spread = 35,
		gravity = -4,
		grow = 3,
		fadeFrom = 0.35,
		drag = 3,
		rotate = 60,
	})
	emitter(
		position,
		dust:Lerp(Color3.new(0, 0, 0), 0.25),
		6,
		14,
		0.18,
		0.5,
		{ direction = direction, spread = 45, gravity = -50 }
	)
	if normal then
		-- Yuvarlak delik ve çevresinde kararmış halka (silindirin ekseni yüzey normali)
		local facing = CFrame.lookAt(position + normal * 0.02, position + normal * 2)
			* CFrame.Angles(0, math.rad(90), 0)
		local hole = part({
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.04, 0.26, 0.26),
			Color = Color3.fromRGB(18, 16, 14),
			Material = Enum.Material.SmoothPlastic,
			CFrame = facing,
		})
		local scorch = part({
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.03, 0.55, 0.55),
			Color = (color or Color3.fromRGB(120, 110, 96)):Lerp(Color3.new(0, 0, 0), 0.55),
			Material = Enum.Material.SmoothPlastic,
			Transparency = 0.45,
			CFrame = facing * CFrame.new(-0.005, 0, 0),
		})
		table.insert(holes, hole)
		table.insert(holes, scorch)
		while #holes > MAX_HOLES * 2 do
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
	-- Ateş topu, yükselen duman, kıvılcım ve toz halkası
	emitter(
		position,
		ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 236, 170)),
			ColorSequenceKeypoint.new(0.4, Color3.fromRGB(255, 130, 40)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(80, 40, 20)),
		}),
		22,
		22,
		3.2,
		0.5,
		{ texture = FIRE_TEXTURE, spread = 180, gravity = 6, light = 1, grow = 1.6, drag = 4, rotate = 90 }
	)
	emitter(position + Vector3.new(0, 2, 0), Color3.fromRGB(70, 66, 60), 26, 10, 4.5, 3.2, {
		texture = SMOKE_TEXTURE,
		spread = 70,
		gravity = 4,
		grow = 2.4,
		fadeFrom = 0.25,
		drag = 1.5,
		rotate = 30,
	})
	emitter(position, Color3.fromRGB(255, 200, 110), 30, 55, 0.18, 0.7, { spread = 180, gravity = -60, light = 1 })
	emitter(
		position,
		DUST.Sand,
		24,
		26,
		2.2,
		1.4,
		{ texture = SMOKE_TEXTURE, spread = 85, gravity = -6, grow = 2, fadeFrom = 0.3, drag = 3 }
	)
	local flashPart =
		part({ Size = Vector3.new(1, 1, 1), Transparency = 1, CFrame = CFrame.new(position + Vector3.new(0, 2, 0)) })
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 170, 90)
	light.Brightness = 8
	light.Range = 40
	light.Parent = flashPart
	task.delay(0.25, function()
		flashPart:Destroy()
	end)
	local camera = workspace.CurrentCamera
	if camera then
		local distance = (camera.CFrame.Position - position).Magnitude
		if distance < 70 then
			Effects.addShake(1.2 * (1 - distance / 70))
		end
	end
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
		local camera = workspace.CurrentCamera
		local far = camera and (camera.CFrame.Position - muzzle.Position).Magnitude > 120
		Effects.flash(muzzle, def and def.class == "Sniper" and 1.6 or 1, far)
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

	local dustVolume = part({
		Name = "AirDust",
		Size = Vector3.new(70, 24, 70),
		Transparency = 1,
	})
	local motes = Instance.new("ParticleEmitter")
	motes.Texture = SPARK_TEXTURE
	motes.Color = ColorSequence.new(Color3.fromRGB(240, 226, 196))
	motes.Size = NumberSequence.new(0.08)
	motes.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.3, 0.55),
		NumberSequenceKeypoint.new(1, 1),
	})
	motes.Lifetime = NumberRange.new(5, 9)
	motes.Rate = 14
	motes.Speed = NumberRange.new(0.3, 1.2)
	motes.SpreadAngle = Vector2.new(180, 180)
	motes.Acceleration = Vector3.new(0.6, -0.05, 0.3)
	motes.LightEmission = 0.3
	motes.Parent = dustVolume
	RunService.Heartbeat:Connect(function()
		local camera = workspace.CurrentCamera
		if camera then
			dustVolume.CFrame = CFrame.new(camera.CFrame.Position)
		end
	end)

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
