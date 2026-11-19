-- Ortam canlılığı (yalnızca bu oyuncunun ekranında): bayraklar rüzgârda
-- dalgalanır, çalı topları yuvarlanır, tepede kuşlar döner, yerde toz savrulur.
-- Hiçbiri oyunu etkilemez: çarpışmaz, mermi geçer, sunucuya bir şey gitmez.

local RunService = game:GetService("RunService")

local Effects = require(script.Parent.Effects)

local Ambience = {}

local FLAG_NAMES = { BaseFlag = true, BaseFlagStripe = true, Flag = true }
local DRY = Color3.fromRGB(168, 144, 92)

local flags = {}
local known = setmetatable({}, { __mode = "k" })
local weeds = {}
local birds = {}
local clock = 0
local nextScan = 0
local nextWeed = 4
local nextGust = 2
local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Exclude

local function wind()
	local ok, value = pcall(function()
		return workspace.GlobalWind
	end)
	if ok and typeof(value) == "Vector3" and value.Magnitude > 0.1 then
		return value
	end
	return Vector3.new(9, 0, 5)
end

local function ambientPart(name, size, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Color = color
	part.Material = material
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Parent = Effects.folder()
	return part
end

-- Bayraklar: harita ve bölge klasörlerinde yeni bayrak var mı?
local function scanFlags()
	for index = #flags, 1, -1 do
		if not flags[index].part.Parent then
			table.remove(flags, index)
		end
	end
	for _, folderName in ipairs({ "Map", "Points" }) do
		local folder = workspace:FindFirstChild(folderName)
		if folder then
			for _, part in ipairs(folder:GetDescendants()) do
				if part:IsA("BasePart") and FLAG_NAMES[part.Name] and not known[part] then
					known[part] = true
					table.insert(flags, { part = part, base = part.CFrame, phase = math.random() * 6 })
				end
			end
		end
	end
end

local function waveFlags()
	for _, flag in ipairs(flags) do
		local part = flag.part
		local half = part.Size.X / 2
		local swing = math.sin(clock * 2.3 + flag.phase) * 0.2 + math.sin(clock * 5.1 + flag.phase * 2) * 0.06
		local droop = math.sin(clock * 1.7 + flag.phase) * 0.04
		-- Direğe bakan kenar (yerel -X) menteşe olur
		part.CFrame = flag.base * CFrame.new(-half, 0, 0) * CFrame.Angles(0, swing, droop) * CFrame.new(half, 0, 0)
	end
end

-- Çalı topu: rüzgâr yönünde yuvarlanıp sekerek ilerler
local function spawnWeed(origin)
	local direction = wind()
	direction = Vector3.new(direction.X, 0, direction.Z).Unit
	local side = Vector3.new(-direction.Z, 0, direction.X)
	local start = origin - direction * 70 + side * (math.random() * 80 - 40)
	local radius = 1 + math.random() * 0.8
	local outer =
		ambientPart("Tumbleweed", Vector3.new(radius * 2, radius * 2, radius * 2), DRY, Enum.Material.LeafyGrass)
	outer.Shape = Enum.PartType.Ball
	outer.Transparency = 0.35
	local inner = ambientPart(
		"Tumbleweed",
		Vector3.new(radius * 1.3, radius * 1.3, radius * 1.3),
		DRY:Lerp(Color3.new(0, 0, 0), 0.3),
		Enum.Material.LeafyGrass
	)
	inner.Shape = Enum.PartType.Ball
	table.insert(weeds, {
		parts = { outer, inner },
		position = start,
		direction = direction,
		speed = 7 + math.random() * 5,
		radius = radius,
		spin = 0,
		bounce = math.random() * 3,
		age = 0,
	})
end

local function rollWeeds(dt)
	for index = #weeds, 1, -1 do
		local weed = weeds[index]
		weed.age += dt
		if weed.age > 16 or not weed.parts[1].Parent then
			for _, part in ipairs(weed.parts) do
				part:Destroy()
			end
			table.remove(weeds, index)
		else
			weed.position += weed.direction * weed.speed * dt
			local ground = 0
			local hit = workspace:Raycast(weed.position + Vector3.new(0, 30, 0), Vector3.new(0, -80, 0), groundParams)
			if hit then
				ground = hit.Position.Y
			end
			weed.spin += weed.speed * dt / weed.radius
			local hop = math.abs(math.sin(weed.age * 2.6 + weed.bounce)) * 1.4
			local cframe = CFrame.new(weed.position.X, ground + weed.radius + hop, weed.position.Z)
				* CFrame.fromAxisAngle(Vector3.new(weed.direction.Z, 0, -weed.direction.X), -weed.spin)
			for _, part in ipairs(weed.parts) do
				part.CFrame = cframe
			end
		end
	end
end

-- Kuşlar: haritanın üstünde geniş daireler çizer, kanat çırpar
local function makeBirds()
	for index = 1, 5 do
		local body =
			ambientPart("Bird", Vector3.new(0.35, 0.3, 1.1), Color3.fromRGB(40, 38, 36), Enum.Material.SmoothPlastic)
		local left =
			ambientPart("Bird", Vector3.new(1.5, 0.06, 0.6), Color3.fromRGB(46, 44, 40), Enum.Material.SmoothPlastic)
		local right =
			ambientPart("Bird", Vector3.new(1.5, 0.06, 0.6), Color3.fromRGB(46, 44, 40), Enum.Material.SmoothPlastic)
		table.insert(birds, {
			body = body,
			left = left,
			right = right,
			radius = 50 + index * 18,
			height = 70 + index * 6,
			speed = 0.12 + index * 0.015,
			phase = index * 1.3,
			flap = math.random() * 6,
		})
	end
end

local function flyBirds()
	for _, bird in ipairs(birds) do
		local angle = clock * bird.speed + bird.phase
		local position = Vector3.new(
			math.cos(angle) * bird.radius,
			bird.height + math.sin(clock * 0.4 + bird.phase) * 4,
			math.sin(angle) * bird.radius
		)
		local ahead =
			Vector3.new(math.cos(angle + 0.05) * bird.radius, position.Y, math.sin(angle + 0.05) * bird.radius)
		local body = CFrame.lookAt(position, ahead) * CFrame.Angles(0, 0, math.rad(-12))
		-- Bir süre çırpar, bir süre süzülür
		local beat = math.sin(clock * 9 + bird.flap)
		local flap = (math.sin(clock * 0.5 + bird.flap) > 0.2) and beat * 0.6 or 0.08
		bird.body.CFrame = body
		bird.left.CFrame = body * CFrame.new(-0.18, 0, 0) * CFrame.Angles(0, 0, flap) * CFrame.new(-0.75, 0, 0)
		bird.right.CFrame = body * CFrame.new(0.18, 0, 0) * CFrame.Angles(0, 0, -flap) * CFrame.new(0.75, 0, 0)
	end
end

function Ambience.step(dt)
	clock += dt
	if clock >= nextScan then
		nextScan = clock + 2
		scanFlags()
	end
	waveFlags()
	flyBirds()
	rollWeeds(dt)

	local camera = workspace.CurrentCamera
	if not camera then
		return
	end
	local origin = camera.CFrame.Position
	if clock >= nextWeed then
		nextWeed = clock + 6 + math.random() * 6
		if #weeds < 3 then
			spawnWeed(Vector3.new(origin.X, 0, origin.Z))
		end
	end
	if clock >= nextGust then
		nextGust = clock + 2.5 + math.random() * 3
		local direction = wind()
		local around = Vector3.new(origin.X + math.random(-30, 30), 0.6, origin.Z + math.random(-30, 30))
		Effects.gust(around, direction)
	end
end

function Ambience.init()
	groundParams.FilterDescendantsInstances = { Effects.folder() }
	makeBirds()
	RunService.Heartbeat:Connect(Ambience.step)
end

return Ambience
